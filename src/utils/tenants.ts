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
import type { Tenant } from '../types';
import { DEFAULT_TENANT, DEFAULT_TENANT_ID, resolveWorkSchedule } from '../types';

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
  const existing = await getTenantBySlug(slug);
  if (!existing) return slug;
  return `${slug}-${Math.random().toString(36).slice(2, 5)}`;
}

export function generateTenantId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Firestore rejects undefined field values — omit them before writes. */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export async function ensureDefaultTenant(): Promise<Tenant> {
  const ref = doc(db, 'tenants', DEFAULT_TENANT_ID);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return { ...DEFAULT_TENANT, ...(snap.data() as Tenant), id: DEFAULT_TENANT_ID };
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
  const code = normalizeSlug(slug);
  if (!code) return null;
  const q = query(collection(db, 'tenants'), where('slug', '==', code), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data() as Tenant;
  return {
    ...DEFAULT_TENANT,
    ...data,
    id: d.id,
    workSchedule: resolveWorkSchedule(data.workSchedule),
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

  const { id: _id, ...data } = tenant;
  await setDoc(doc(db, 'tenants', id), omitUndefined(data as Record<string, unknown>));
  return tenant;
}

/** Permanently remove tenant document. Cannot delete the default workspace. */
export async function deleteTenant(tenantId: string): Promise<void> {
  if (!tenantId || tenantId === DEFAULT_TENANT_ID) {
    throw new Error('The default company workspace cannot be deleted.');
  }
  await deleteDoc(doc(db, 'tenants', tenantId));
}

export async function listTenants(): Promise<Tenant[]> {
  const snap = await getDocs(collection(db, 'tenants'));
  return snap.docs
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
}

export async function countTenantUsers(tenantId: string): Promise<number> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.filter((d) => {
    const u = d.data() as { tenantId?: string; active?: boolean };
    return (u.tenantId || 'default') === tenantId && u.active !== false;
  }).length;
}

export async function updateTenant(
  tenantId: string,
  patch: Partial<Tenant>,
): Promise<void> {
  const { id: _id, ...rest } = patch as Tenant;
  await setDoc(
    doc(db, 'tenants', tenantId),
    omitUndefined({ ...rest, updatedAt: Timestamp.now() }),
    { merge: true },
  );
}
