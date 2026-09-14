/**
 * Cloud Functions:
 * - adminUpdateUserAuth — admin updates another user's Auth email/password (same tenant)
 * - sendTestEmail — test message using tenant-scoped SMTP (password from Secret Manager)
 * - sendAppEmail — outbound mail to a same-tenant user
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const nodemailer = require('nodemailer');

initializeApp();

const smtpPassword = defineSecret('SMTP_PASSWORD');
const emailFunctionOptions = {
  region: 'us-central1',
  secrets: [smtpPassword],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT = 200;
const MAX_TEXT = 20000;

function sanitizeHeader(value, maxLen) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function isValidEmail(value) {
  const email = String(value || '')
    .trim()
    .toLowerCase();
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email);
}

function emailSettingsDocId(tenantId) {
  const tid = tenantId || 'default';
  return tid === 'default' ? 'smtp' : `smtp_${tid}`;
}

function callerTenantId(caller) {
  return caller.tenantId || 'default';
}

async function loadCaller(uid) {
  const snap = await getFirestore().collection('users').doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }
  return { uid, ...snap.data() };
}

function assertAdminRole(caller) {
  if (caller.role !== 'admin' && caller.platformAdmin !== true) {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }
}

async function loadSmtpSettings(tenantId) {
  const id = emailSettingsDocId(tenantId);
  const snap = await getFirestore().collection('payrollSettings').doc(id).get();
  if (!snap.exists) {
    throw new HttpsError('failed-precondition', 'SMTP settings are not configured.');
  }
  const smtp = snap.data() || {};
  if (!smtp.enabled) {
    throw new HttpsError('failed-precondition', 'SMTP email is disabled in Settings.');
  }
  if (!smtp.host && smtp.publicKey) {
    throw new HttpsError(
      'failed-precondition',
      'This workspace uses EmailJS on the client. SMTP host is not configured.',
    );
  }
  if (!smtp.host || !smtp.fromEmail) {
    throw new HttpsError('failed-precondition', 'SMTP host and From email are required.');
  }
  return smtp;
}

function createTransport(smtp, password) {
  return nodemailer.createTransport({
    host: String(smtp.host).trim(),
    port: Number(smtp.port) || (smtp.secure ? 465 : 587),
    secure: !!smtp.secure,
    auth: {
      user: String(smtp.username || smtp.fromEmail).trim(),
      pass: password,
    },
  });
}

function publicMailError(error) {
  const msg = String(error?.message || '');
  if (/auth|invalid login|EAUTH/i.test(msg)) {
    return 'SMTP authentication failed. Check host, username, and SMTP_PASSWORD.';
  }
  if (/connect|ENOTFOUND|ETIMEDOUT|ECONN/i.test(msg)) {
    return 'Could not reach the SMTP server.';
  }
  return 'Failed to send email.';
}

async function sendMailWithSmtp({ to, subject, text, html, tenantId }) {
  const smtp = await loadSmtpSettings(tenantId);
  const password = smtpPassword.value();
  if (!password) {
    throw new HttpsError(
      'failed-precondition',
      'SMTP_PASSWORD is not configured in Firebase Secret Manager.',
    );
  }
  const transporter = createTransport(smtp, password);
  try {
    const info = await transporter.sendMail({
      from: {
        name: sanitizeHeader(smtp.fromName || 'HR Attendance', 80),
        address: String(smtp.fromEmail).trim(),
      },
      to,
      subject: sanitizeHeader(subject, MAX_SUBJECT),
      text,
      html,
    });
    return { messageId: info.messageId };
  } finally {
    transporter.close();
  }
}

async function assertRecipientInTenant(to, tenantId, isPlatform) {
  if (isPlatform) return;
  const snap = await getFirestore()
    .collection('users')
    .where('email', '==', to)
    .limit(10)
    .get();
  const allowed = snap.docs.some((d) => (d.data()?.tenantId || 'default') === tenantId);
  if (!allowed) {
    throw new HttpsError('permission-denied', 'Recipient must be a user in your workspace.');
  }
}

exports.adminUpdateUserAuth = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const caller = await loadCaller(request.auth.uid);
  assertAdminRole(caller);

  const { uid, email, password } = request.data || {};
  if (!uid || typeof uid !== 'string') {
    throw new HttpsError('invalid-argument', 'uid is required.');
  }

  const targetSnap = await getFirestore().collection('users').doc(uid).get();
  if (!targetSnap.exists) {
    throw new HttpsError('not-found', 'User not found.');
  }
  const target = targetSnap.data() || {};
  if (!caller.platformAdmin) {
    if ((target.tenantId || 'default') !== callerTenantId(caller)) {
      throw new HttpsError('permission-denied', 'Cannot update users in another workspace.');
    }
    if (target.platformAdmin === true) {
      throw new HttpsError('permission-denied', 'Cannot update a platform owner account.');
    }
  }

  const updates = {};
  if (email != null && String(email).trim()) {
    const normalized = String(email).trim().toLowerCase();
    if (!isValidEmail(normalized)) {
      throw new HttpsError('invalid-argument', 'Invalid email address.');
    }
    updates.email = normalized;
    updates.emailVerified = false;
  }
  if (password != null && String(password).length > 0) {
    if (String(password).length < 6) {
      throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');
    }
    updates.password = String(password);
  }

  if (Object.keys(updates).length === 0) {
    return { ok: true, updated: false };
  }

  await getAuth().updateUser(uid, updates);

  if (updates.email) {
    await getFirestore().collection('users').doc(uid).set(
      { email: updates.email, updatedAt: new Date() },
      { merge: true },
    );
  }

  return { ok: true, updated: true };
});

exports.sendTestEmail = onCall(emailFunctionOptions, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const caller = await loadCaller(request.auth.uid);
  assertAdminRole(caller);

  const to = String(request.data?.to || '')
    .trim()
    .toLowerCase();
  if (!isValidEmail(to)) {
    throw new HttpsError('invalid-argument', 'Valid recipient email is required.');
  }

  try {
    const result = await sendMailWithSmtp({
      to,
      tenantId: callerTenantId(caller),
      subject: 'HR Attendance — SMTP test',
      text: 'This is a test email from HR Attendance. Your SMTP settings are working.',
      html: '<p>This is a test email from <strong>HR Attendance</strong>.</p><p>Your SMTP settings are working.</p>',
    });
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('internal', publicMailError(e));
  }
});

exports.sendAppEmail = onCall(emailFunctionOptions, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const caller = await loadCaller(request.auth.uid);
  assertAdminRole(caller);

  const to = String(request.data?.to || '')
    .trim()
    .toLowerCase();
  const subject = sanitizeHeader(request.data?.subject, MAX_SUBJECT);
  const text = String(request.data?.text || '').trim().slice(0, MAX_TEXT);
  const html = request.data?.html
    ? String(request.data.html).slice(0, MAX_TEXT * 2)
    : undefined;

  if (!isValidEmail(to)) {
    throw new HttpsError('invalid-argument', 'Valid recipient email is required.');
  }
  if (!subject || !text) {
    throw new HttpsError('invalid-argument', 'Subject and text are required.');
  }

  await assertRecipientInTenant(to, callerTenantId(caller), caller.platformAdmin === true);

  try {
    const result = await sendMailWithSmtp({
      to,
      subject,
      text,
      html,
      tenantId: callerTenantId(caller),
    });
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('internal', publicMailError(e));
  }
});
