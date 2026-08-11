/**
 * Platform owner bootstrap — emails that auto-receive platformAdmin on login.
 * Keep this list small (vendor accounts only).
 */
export const PLATFORM_ADMIN_EMAILS = ['oasfour77@gmail.com'] as const;

export function isPlatformAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (PLATFORM_ADMIN_EMAILS as readonly string[]).includes(normalized);
}
