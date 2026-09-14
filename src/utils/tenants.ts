/**
 * Multi-tenant SaaS helpers — tenant CRUD, slug codes, default migration.
 */

import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  limit,
  Timestamp,
} from '../services/firebase';
import { loadTenantRecords, tenantCollectionQuery } from './tenantScope';
import { checkTenantLicense } from './tenantLicense';
import { DEFAULT_TENANT, DEFAULT_TENANT_ID, resolveWorkSchedule, type Tenant, type TenantInvite } from '../types';

export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/** Unique company invite code from name (auto). */
export async function allocateUniqueSlug(name: string): Promise<string> {
  let slug = normalizeSlug(name);
  if (!slug) slug = `co-${Date.now().toString(36)}`;
  if (!(await slugIsTaken(slug))) return slug;
  return `${slug}-${Math.random().toString(36).slice(2, 5)}`;
}

async function slugIsTaken(slug: string): Promise<boolean> {
  if (await getTenantInviteBySlug(slug)) return true;
  try {
    const q = query(collection(db, 'tenants'), where('slug', '==', slug), limit(1));
    const snap = await getDocs(q);
    return !snap.empty;
  } catch {
    return false;
  }
}

export function generateTenantId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Firestore rejects undefined field values — omit them before writes. */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const INVITES_COL = 'tenantInvites';

function inviteFromTenant(tenant: Tenant): TenantInvite {
  const slug = normalizeSlug(tenant.slug || tenant.id) || tenant.id;
  return {
    tenantId: tenant.id,
    name: tenant.name,
    slug,
    active: tenant.active !== false,
    licenseState: checkTenantLicense(tenant).state,
  };
}

export async function upsertTenantInvite(
  tenant: Tenant,
  previousSlug?: string,
): Promise<void> {
  const invite = inviteFromTenant(tenant);
  await setDoc(
    doc(db, INVITES_COL, invite.slug),
    omitUndefined({ ...invite, updatedAt: Timestamp.now() } as Record<string, unknown>),
  );
  const oldSlug = previousSlug ? normalizeSlug(previousSlug) : '';
  if (oldSlug && oldSlug !== invite.slug) {
    await deleteDoc(doc(db, INVITES_COL, oldSlug)).catch(() => undefined);
  }
}

export async function getTenantInviteBySlug(slug: string): Promise<TenantInvite | null> {
  const code = normalizeSlug(slug);
  if (!code) return null;
  const snap = await getDoc(doc(db, INVITES_COL, code));
  if (!snap.exists()) return null;
  const data = snap.data() as TenantInvite;
  return {
    tenantId: data.tenantId || snap.id,
    name: data.name || 'Company',
    slug: data.slug || code,
    active: data.active !== false,
    licenseState: data.licenseState || (data.active === false ? 'suspended' : 'ok'),
  };
}

export async function ensureDefaultTenant(): Promise<Tenant> {
  const ref = doc(db, 'tenants', DEFAULT_TENANT_ID);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const existing = { ...DEFAULT_TENANT, ...(snap.data() as Tenant), id: DEFAULT_TENANT_ID };
    await upsertTenantInvite(existing).catch(() => undefined);
    return existing;
  }

  // Migrate legacy companySettings/main if present
  let legacy: Partial<Tenant> = {};
  try {
    const companySnap = await getDoc(doc(db, 'companySettings', 'main'));
    if (companySnap.exists()) {
      const c = companySnap.data() as any;
      legacy = {
        name: c.name || DEFAULT_TENANT.name,
        logoUrl: c.logoUrl,
        countryCode: c.countryCode || DEFAULT_TENANT.countryCode,
        currencyCode: c.currencyCode || DEFAULT_TENANT.currencyCode,
        currencySymbol: c.currencySymbol || DEFAULT_TENANT.currencySymbol,
        locale: c.locale || DEFAULT_TENANT.locale,
        defaultLanguage: c.defaultLanguage || DEFAULT_TENANT.defaultLanguage,
        timezone: c.timezone || DEFAULT_TENANT.timezone,
      };
    }
  } catch {
    /* ignore */
  }

  const tenant: Tenant = {
    ...DEFAULT_TENANT,
    ...legacy,
    id: DEFAULT_TENANT_ID,
    slug: 'default',
    createdAt: Timestamp.now(),
  };
  const { id: _id, ...data } = tenant;
  await setDoc(ref, omitUndefined(data), { merge: true });
  await upsertTenantInvite({ ...tenant, id: DEFAULT_TENANT_ID }).catch(() => undefined);
  return tenant;
}

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const snap = await getDoc(doc(db, 'tenants', tenantId));
  if (!snap.exists()) return null;
  const data = snap.data() as Tenant;
  return {
    ...DEFAULT_TENANT,
    ...data,
    id: snap.id,
    workSchedule: resolveWorkSchedule(data.workSchedule),
  };
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const invite = await getTenantInviteBySlug(slug);
  if (!invite) return null;
  return {
    id: invite.tenantId,
    name: invite.name,
    slug: invite.slug,
    active: invite.active && invite.licenseState === 'ok',
  };
}

export async function createTenant(params: {
  name: string;
  slug?: string;
  createdBy: string;
  countryCode?: string;
  currencyCode?: string;
  currencySymbol?: string;
  plan?: Tenant['plan'];
  maxUsers?: number;
  licenseExpiresAt?: string;
  licenseTerm?: Tenant['licenseTerm'];
  trialDays?: number;
  licenseKey?: string;
  licenseNotes?: string;
  active?: boolean;
  adminEmail?: string;
  adminUid?: string;
}): Promise<Tenant> {
  const name = params.name.trim();
  if (!name) throw new Error('Company name is required.');

  const slug = params.slug?.trim()
    ? await allocateUniqueSlug(params.slug)
    : await allocateUniqueSlug(name);

  const id = generateTenantId();
  const currency = params.currencyCode || 'EGP';
  const tenant: Tenant = {
    ...DEFAULT_TENANT,
    id,
    name,
    slug,
    countryCode: params.countryCode || 'EG',
    currencyCode: currency,
    currencySymbol: params.currencySymbol || (currency === 'EGP' ? 'E£' : currency),
    createdBy: params.createdBy,
    createdAt: Timestamp.now(),
    active: params.active !== false,
    plan: params.plan || 'free',
  };
  if (params.maxUsers != null && params.maxUsers > 0) tenant.maxUsers = Math.floor(params.maxUsers);
  if (params.licenseExpiresAt) tenant.licenseExpiresAt = params.licenseExpiresAt.slice(0, 10);
  if (params.licenseTerm) tenant.licenseTerm = params.licenseTerm;
  if (params.trialDays != null && params.trialDays > 0) tenant.trialDays = Math.floor(params.trialDays);
  if (params.licenseKey?.trim()) tenant.licenseKey = params.licenseKey.trim();
  if (params.licenseNotes?.trim()) tenant.licenseNotes = params.licenseNotes.trim();
  if (params.adminEmail?.trim()) tenant.adminEmail = params.adminEmail.trim().toLowerCase();
  if (params.adminUid?.trim()) tenant.adminUid = params.adminUid.trim();

  const { id: _id, ...data } = tenant;
  await setDoc(doc(db, 'tenants', id), omitUndefined(data as Record<string, unknown>));
  await upsertTenantInvite(tenant);
  return tenant;
}

/** Permanently remove tenant document. Cannot delete the default workspace. */
export async function deleteTenant(tenantId: string): Promise<void> {
  if (!tenantId || tenantId === DEFAULT_TENANT_ID) {
    throw new Error('The default company workspace cannot be deleted.');
  }
  const existing = await getTenantById(tenantId);
  await deleteDoc(doc(db, 'tenants', tenantId));
  const slug = existing?.slug ? normalizeSlug(existing.slug) : '';
  if (slug) await deleteDoc(doc(db, INVITES_COL, slug)).catch(() => undefined);
}

export async function listTenants(): Promise<Tenant[]> {
  const snap = await getDocs(collection(db, 'tenants'));
  const rows = snap.docs
    .map((d) => {
      const data = d.data() as Tenant;
      return {
        ...DEFAULT_TENANT,
        ...data,
        id: d.id,
        workSchedule: resolveWorkSchedule(data.workSchedule),
      };
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  await Promise.all(rows.map((row) => upsertTenantInvite(row).catch(() => undefined)));
  return rows;
}

export async function countTenantUsers(tenantId: string): Promise<number> {
  const snap = await getDocs(tenantCollectionQuery('users', tenantId));
  return snap.docs.filter((d) => {
    const u = d.data() as { active?: boolean };
    return u.active !== false;
  }).length;
}

export type TenantAdminAccount = {
  uid: string;
  email: string;
  name?: string;
};

/** Active seat count plus the company admin login, from one users scan. */
export async function getTenantSeatAndAdmin(
  tenantId: string,
  preferredEmail?: string,
): Promise<{
  seats: number;
  admin: TenantAdminAccount | null;
}> {
  const rows = await loadTenantRecords<{
    uid: string;
    email?: string;
    fullName?: string;
    role?: string;
    active?: boolean;
  }>('users', tenantId, 'uid');
  const seats = rows.filter((u) => u.active !== false).length;
  const admins = rows.filter((u) => u.role === 'admin' && u.email);
  const wanted = preferredEmail?.trim().toLowerCase();
  const preferred =
    (wanted && admins.find((u) => u.email?.trim().toLowerCase() === wanted)) ||
    admins.find((u) => u.active !== false) ||
    admins[0];
  return {
    seats,
    admin: preferred?.email
      ? {
          uid: preferred.uid,
          email: preferred.email.trim().toLowerCase(),
          name: preferred.fullName,
        }
      : null,
  };
}

export async function updateTenant(
  tenantId: string,
  patch: Partial<Tenant>,
): Promise<void> {
  const { id: _id, ...rest } = patch as Tenant;
  const previous = await getTenantById(tenantId);
  await setDoc(
    doc(db, 'tenants', tenantId),
    omitUndefined({ ...rest, updatedAt: Timestamp.now() }),
    { merge: true },
  );
  const next = await getTenantById(tenantId);
  if (next) await upsertTenantInvite(next, previous?.slug);
}
