/**
 * Cloud Functions:
 * - adminUpdateUserAuth — admin updates another user's Auth email/password
 * - sendTestEmail — send a test message using SMTP from payrollSettings/smtp
 * - sendAppEmail — generic outbound mail helper for future features
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const nodemailer = require('nodemailer');
// zktecoAdms moved to VPS service (vps/zkteco-adms). Not deployed via Cloud Functions.

initializeApp();

const smtpPassword = defineSecret('SMTP_PASSWORD');
const emailFunctionOptions = {
  region: 'us-central1',
  secrets: [smtpPassword],
};

async function assertAdmin(uid) {
  const snap = await getFirestore().collection('users').doc(uid).get();
  if (!snap.exists || snap.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }
  return snap.data();
}

async function loadSmtpSettings() {
  const snap = await getFirestore().collection('payrollSettings').doc('smtp').get();
  if (!snap.exists) {
    throw new HttpsError('failed-precondition', 'SMTP settings are not configured.');
  }
  const smtp = snap.data() || {};
  if (!smtp.enabled) {
    throw new HttpsError('failed-precondition', 'SMTP email is disabled in Settings.');
  }
  if (!smtp.host || !smtp.fromEmail) {
    throw new HttpsError('failed-precondition', 'SMTP host and From email are required.');
  }
  return smtp;
}

function createTransport(smtp, password) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || (smtp.secure ? 465 : 587),
    secure: !!smtp.secure,
    auth: {
      user: smtp.username || smtp.fromEmail,
      pass: password,
    },
  });
}

async function sendMailWithSmtp({ to, subject, text, html }) {
  const smtp = await loadSmtpSettings();
  const password = smtpPassword.value();
  if (!password) {
    throw new HttpsError(
      'failed-precondition',
      'SMTP_PASSWORD is not configured in Firebase Secret Manager.',
    );
  }
  const transporter = createTransport(smtp, password);
  const fromName = smtp.fromName || 'HR Attendance';
  const info = await transporter.sendMail({
    from: `"${fromName}" <${smtp.fromEmail}>`,
    to,
    subject,
    text,
    html,
  });
  return { messageId: info.messageId };
}

exports.adminUpdateUserAuth = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  await assertAdmin(request.auth.uid);

  const { uid, email, password } = request.data || {};
  if (!uid || typeof uid !== 'string') {
    throw new HttpsError('invalid-argument', 'uid is required.');
  }

  const updates = {};
  if (email != null && String(email).trim()) {
    const normalized = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
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
  await assertAdmin(request.auth.uid);

  const to = String(request.data?.to || '').trim().toLowerCase();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new HttpsError('invalid-argument', 'Valid recipient email is required.');
  }

  try {
    const result = await sendMailWithSmtp({
      to,
      subject: 'HR Attendance — SMTP test',
      text: 'This is a test email from HR Attendance. Your SMTP settings are working.',
      html: '<p>This is a test email from <strong>HR Attendance</strong>.</p><p>Your SMTP settings are working.</p>',
    });
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('internal', e?.message || 'Failed to send email.');
  }
});

exports.sendAppEmail = onCall(emailFunctionOptions, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  await assertAdmin(request.auth.uid);

  const to = String(request.data?.to || '').trim().toLowerCase();
  const subject = String(request.data?.subject || '').trim();
  const text = String(request.data?.text || '').trim();
  const html = request.data?.html ? String(request.data.html) : undefined;

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new HttpsError('invalid-argument', 'Valid recipient email is required.');
  }
  if (!subject || !text) {
    throw new HttpsError('invalid-argument', 'Subject and text are required.');
  }

  try {
    const result = await sendMailWithSmtp({ to, subject, text, html });
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('internal', e?.message || 'Failed to send email.');
  }
});

