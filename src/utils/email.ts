/** Shared email helpers — keep validation identical across UI, client mail, and CF. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

export function isValidEmail(value: string | null | undefined): boolean {
  const email = normalizeEmail(value);
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strip CR/LF so values cannot split SMTP / EmailJS headers. */
export function sanitizeHeaderValue(value: string, maxLen = 200): string {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, maxLen);
}
