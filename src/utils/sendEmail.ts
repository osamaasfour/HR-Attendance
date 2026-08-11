/**
 * Spark-compatible outbound email via EmailJS HTTPS API.
 * Settings are scoped per tenant: payrollSettings/smtp or smtp_{tenantId}.
 */
import { db, doc, getDoc } from '../services/firebase';
import type { EmailSettings } from '../types';
import { DEFAULT_EMAIL_SETTINGS, DEFAULT_TENANT_ID } from '../types';

const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send';

export function emailSettingsDocId(tenantId?: string): string {
  const tid = tenantId || DEFAULT_TENANT_ID;
  return tid === DEFAULT_TENANT_ID ? 'smtp' : `smtp_${tid}`;
}

/** Payroll formula settings doc id (default tenant uses `default`). */
export function payrollSettingsDocId(tenantId?: string): string {
  const tid = tenantId || DEFAULT_TENANT_ID;
  return tid === DEFAULT_TENANT_ID ? 'default' : tid;
}

export async function loadEmailSettings(tenantId?: string): Promise<EmailSettings> {
  const snap = await getDoc(doc(db, 'payrollSettings', emailSettingsDocId(tenantId)));
  if (!snap.exists()) return { ...DEFAULT_EMAIL_SETTINGS };
  return { ...DEFAULT_EMAIL_SETTINGS, ...(snap.data() as EmailSettings) };
}

function assertReady(settings: EmailSettings) {
  if (!settings.enabled) {
    throw new Error('Outbound email is disabled in Settings.');
  }
  if (!settings.publicKey?.trim() || !settings.serviceId?.trim() || !settings.templateId?.trim()) {
    throw new Error('EmailJS Public Key, Service ID, and Template ID are required.');
  }
}

async function postEmailJs(body: Record<string, unknown>): Promise<void> {
  const res = await fetch(EMAILJS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `EmailJS error (${res.status})`);
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
  const settings =
    params.settings || (await loadEmailSettings(params.tenantId));
  assertReady(settings);

  const to = params.to.trim().toLowerCase();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error('Valid recipient email is required.');
  }

  const payload: Record<string, unknown> = {
    service_id: settings.serviceId.trim(),
    template_id: settings.templateId.trim(),
    user_id: settings.publicKey.trim(),
    template_params: {
      to_email: to,
      reply_to: settings.fromEmail || to,
      from_name: settings.fromName || 'ECF HR',
      from_email: settings.fromEmail || '',
      subject: params.subject,
      message: params.text,
      html_message: params.html || params.text,
    },
  };

  if (settings.privateKey?.trim()) {
    payload.accessToken = settings.privateKey.trim();
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

/** Fire-and-forget helper — never throws to callers (request flow must not fail on email). */
export async function trySendAppEmail(params: {
  to?: string | null;
  subject: string;
  text: string;
  html?: string;
  tenantId?: string;
}): Promise<void> {
  if (!params.to?.trim()) return;
  try {
    const settings = await loadEmailSettings(params.tenantId);
    if (!settings.enabled) return;
    await sendAppEmail({
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
      settings,
      tenantId: params.tenantId,
    });
  } catch (e) {
    console.warn('[Email] send skipped/failed', e);
  }
}
