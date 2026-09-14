/**
 * Outbound email via EmailJS HTTPS (Spark-compatible, no SMTP from the client).
 * Public IDs live in emailPublic/{tenantId} so employees can send.
 * privateKey stays on admin-only payrollSettings and is never loaded for send.
 */
import { db, doc, getDoc, setDoc } from '../services/firebase';
import type { EmailSettings } from '../types';
import { DEFAULT_EMAIL_SETTINGS, DEFAULT_TENANT_ID } from '../types';
import {
  escapeHtml,
  isValidEmail,
  normalizeEmail,
  sanitizeHeaderValue,
} from './email';

const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send';
const FETCH_TIMEOUT_MS = 20_000;
const MAX_SUBJECT = 200;
const MAX_TEXT = 20_000;

export { escapeHtml, isValidEmail, normalizeEmail };

export function emailSettingsDocId(tenantId?: string): string {
  const tid = tenantId || DEFAULT_TENANT_ID;
  return tid === DEFAULT_TENANT_ID ? 'smtp' : `smtp_${tid}`;
}

export function emailPublicDocId(tenantId?: string): string {
  return tenantId?.trim() || DEFAULT_TENANT_ID;
}

/** Payroll formula settings doc id (default tenant uses `default`). */
export function payrollSettingsDocId(tenantId?: string): string {
  const tid = tenantId || DEFAULT_TENANT_ID;
  return tid === DEFAULT_TENANT_ID ? 'default' : tid;
}

export function toPublicEmailSettings(settings: EmailSettings, tenantId?: string): EmailSettings {
  return {
    enabled: !!settings.enabled,
    provider: 'emailjs',
    tenantId: tenantId || settings.tenantId,
    publicKey: (settings.publicKey || '').trim(),
    serviceId: (settings.serviceId || '').trim(),
    templateId: (settings.templateId || '').trim(),
    fromEmail: settings.fromEmail || '',
    fromName: settings.fromName,
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
  };
}

export async function publishEmailPublic(
  tenantId: string,
  settings: EmailSettings,
): Promise<void> {
  const tid = emailPublicDocId(tenantId);
  const pub = toPublicEmailSettings(settings, tid);
  await setDoc(
    doc(db, 'emailPublic', tid),
    {
      enabled: pub.enabled,
      provider: 'emailjs',
      tenantId: tid,
      publicKey: pub.publicKey,
      serviceId: pub.serviceId,
      templateId: pub.templateId,
      fromEmail: pub.fromEmail,
      ...(pub.fromName ? { fromName: pub.fromName } : {}),
      ...(pub.updatedAt ? { updatedAt: pub.updatedAt } : {}),
      ...(pub.updatedBy ? { updatedBy: pub.updatedBy } : {}),
    },
    { merge: true },
  );
}

export async function loadEmailSettings(tenantId?: string): Promise<EmailSettings> {
  const tid = emailPublicDocId(tenantId);
  try {
    const pub = await getDoc(doc(db, 'emailPublic', tid));
    if (pub.exists()) {
      return { ...DEFAULT_EMAIL_SETTINGS, ...(pub.data() as EmailSettings), privateKey: undefined };
    }
  } catch {
    /* permission or missing */
  }
  return { ...DEFAULT_EMAIL_SETTINGS };
}

/** Admin Settings only — may include privateKey from payrollSettings. */
export async function loadAdminEmailSettings(tenantId?: string): Promise<EmailSettings> {
  const tid = emailPublicDocId(tenantId);
  const pub = await loadEmailSettings(tid);
  try {
    const snap = await getDoc(doc(db, 'payrollSettings', emailSettingsDocId(tid)));
    if (!snap.exists()) return pub;
    return { ...DEFAULT_EMAIL_SETTINGS, ...pub, ...(snap.data() as EmailSettings) };
  } catch {
    return pub;
  }
}

function assertReady(settings: EmailSettings) {
  if (!settings.enabled) {
    throw new Error('Outbound email is disabled in Settings.');
  }
  if (!settings.publicKey?.trim() || !settings.serviceId?.trim() || !settings.templateId?.trim()) {
    throw new Error('EmailJS Public Key, Service ID, and Template ID are required.');
  }
}

function mapEmailJsError(status: number): Error {
  if (status === 401 || status === 403) {
    return new Error('EmailJS rejected the API keys. If you set a Private Key, leave it empty for in-app HR mail.');
  }
  if (status === 429) {
    return new Error('EmailJS rate limit reached. Try again later.');
  }
  return new Error(`Could not send email (${status}).`);
}

async function postEmailJs(body: Record<string, unknown>): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(EMAILJS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    await res.text().catch(() => '');
    if (!res.ok) throw mapEmailJsError(res.status);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Email request timed out.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendAppEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  settings?: EmailSettings;
  tenantId?: string;
}): Promise<void> {
  const provided = params.settings;
  const settings = provided || (await loadEmailSettings(params.tenantId));
  assertReady(settings);

  const to = normalizeEmail(params.to);
  if (!isValidEmail(to)) {
    throw new Error('Valid recipient email is required.');
  }

  const subject = sanitizeHeaderValue(params.subject, MAX_SUBJECT);
  const text = params.text.trim().slice(0, MAX_TEXT);
  if (!subject || !text) {
    throw new Error('Subject and message are required.');
  }

  const fromEmail = isValidEmail(settings.fromEmail) ? normalizeEmail(settings.fromEmail) : to;
  const fromName = sanitizeHeaderValue(settings.fromName || 'HR Attendance', 80);
  const html = (params.html || `<p>${escapeHtml(text)}</p>`).slice(0, MAX_TEXT * 2);

  const payload: Record<string, unknown> = {
    service_id: settings.serviceId.trim(),
    template_id: settings.templateId.trim(),
    user_id: settings.publicKey.trim(),
    template_params: {
      to_email: to,
      reply_to: fromEmail,
      from_name: fromName,
      from_email: fromEmail,
      subject,
      message: text,
      html_message: html,
    },
  };

  // HR request send never uses privateKey. Admin test may pass it in `settings`.
  if (provided?.privateKey?.trim()) {
    payload.accessToken = provided.privateKey.trim();
  }

  await postEmailJs(payload);
}

export async function sendTestEmail(
  to: string,
  settings?: EmailSettings,
  tenantId?: string,
): Promise<void> {
  await sendAppEmail({
    to,
    subject: 'HR Attendance — email test',
    text: 'This is a test email from HR Attendance. Your EmailJS settings are working.',
    html: '<p>This is a test email from <strong>HR Attendance</strong>.</p><p>Your EmailJS settings are working.</p>',
    settings,
    tenantId,
  });
}

/** Fire-and-forget — request flows must not fail if mail is down. */
export async function trySendAppEmail(params: {
  to?: string | null;
  subject: string;
  text: string;
  html?: string;
  tenantId?: string;
}): Promise<void> {
  if (!isValidEmail(params.to)) return;
  try {
    await sendAppEmail({
      to: params.to as string,
      subject: params.subject,
      text: params.text,
      html: params.html,
      tenantId: params.tenantId,
    });
  } catch (e) {
    console.warn('[Email] send skipped/failed');
    if (__DEV__) console.warn(e);
  }
}
