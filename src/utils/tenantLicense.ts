/**
 * Per-tenant license / seat helpers (Step A SaaS control).
 */

import type { Tenant } from '../types';

export type LicenseState = 'ok' | 'suspended' | 'expired';

/** Warn admins when license ends within this many days (inclusive). */
export const LICENSE_EXPIRY_WARN_DAYS = 14;

export type LicenseCheck = {
  state: LicenseState;
  /** Human-readable reason when not ok */
  reason?: string;
  expiresOn?: string | null;
  daysLeft?: number | null;
  maxUsers?: number | null;
  /** True when licensed but expiry is within LICENSE_EXPIRY_WARN_DAYS */
  expiringSoon?: boolean;
};

type DateLike = string | Date | { toDate?: () => Date } | null | undefined;

function toYmd(value: DateLike): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return toYmd(d);
    return null;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  try {
    const d = value.toDate?.();
    return d ? toYmd(d) : null;
  } catch {
    return null;
  }
}

/** Today as YYYY-MM-DD in local calendar (license day is date-based). */
export function todayYmd(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export type LicenseTerm = 'monthly' | 'quarterly' | 'annual' | 'trial';

/** Expiry date from start (creation day) based on license term. */
export function calculateLicenseExpiry(
  term: LicenseTerm,
  trialDays = 14,
  from: Date = new Date(),
): string {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(start);
  switch (term) {
    case 'monthly':
      end.setMonth(end.getMonth() + 1);
      break;
    case 'quarterly':
      end.setMonth(end.getMonth() + 3);
      break;
    case 'annual':
      end.setFullYear(end.getFullYear() + 1);
      break;
    case 'trial': {
      const days = Math.max(1, Math.floor(Number(trialDays) || 14));
      end.setDate(end.getDate() + days);
      break;
    }
  }
  // Inclusive end date = day before next period for month/year? User said start from creation day
  // Monthly from Aug 11 → Sep 11 is common SaaS. Keep calendar add.
  return todayYmd(end);
}

export function daysUntilExpiry(expiresYmd: string, now = new Date()): number {
  const [y, m, d] = expiresYmd.split('-').map(Number);
  const end = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59);
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function checkTenantLicense(tenant: Tenant | null | undefined, now = new Date()): LicenseCheck {
  if (!tenant) {
    return { state: 'suspended', reason: 'Company workspace not found.' };
  }
  if (tenant.active === false) {
    return { state: 'suspended', reason: 'This company workspace is suspended.' };
  }

  const expiresOn = toYmd(tenant.licenseExpiresAt);
  const maxUsers =
    typeof tenant.maxUsers === 'number' && tenant.maxUsers > 0 ? tenant.maxUsers : null;

  if (!expiresOn) {
    // Grandfathered: no expiry set yet
    return { state: 'ok', expiresOn: null, daysLeft: null, maxUsers, expiringSoon: false };
  }

  const today = todayYmd(now);
  if (expiresOn < today) {
    return {
      state: 'expired',
      reason: 'Company license has expired. Contact your vendor to renew.',
      expiresOn,
      daysLeft: 0,
      maxUsers,
      expiringSoon: false,
    };
  }

  const daysLeft = daysUntilExpiry(expiresOn, now);
  return {
    state: 'ok',
    expiresOn,
    daysLeft,
    maxUsers,
    expiringSoon: daysLeft <= LICENSE_EXPIRY_WARN_DAYS,
  };
}

/** Licensed but due within the warning window. */
export function isLicenseExpiringSoon(
  tenant: Tenant | null | undefined,
  warnDays = LICENSE_EXPIRY_WARN_DAYS,
  now = new Date(),
): boolean {
  const check = checkTenantLicense(tenant, now);
  return (
    check.state === 'ok' &&
    check.daysLeft != null &&
    check.daysLeft <= warnDays
  );
}

export function assertTenantLicenseOk(tenant: Tenant | null | undefined): LicenseCheck {
  const check = checkTenantLicense(tenant);
  if (check.state !== 'ok') {
    const err: any = new Error(check.reason || 'License invalid');
    err.code =
      check.state === 'expired' ? 'auth/license-expired' : 'auth/tenant-suspended';
    err.license = check;
    throw err;
  }
  return check;
}

/** Format expiry for UI. */
export function formatLicenseExpiry(tenant: Tenant | null | undefined): string {
  const ymd = toYmd(tenant?.licenseExpiresAt);
  return ymd || '—';
}
