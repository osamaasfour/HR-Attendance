/**
 * Tenant-scoped Firestore reads.
 * Unfiltered collection scans fail once other tenants' docs exist (rules deny them).
 */
import type { QueryConstraint } from 'firebase/firestore';
import { collection, db, getDocs, query, where } from '../services/firebase';
import { DEFAULT_TENANT_ID } from '../types';

export function resolveTenantId(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return DEFAULT_TENANT_ID;
}

export function tenantCollectionQuery(collectionName: string, tenantId: string) {
  return query(collection(db, collectionName), where('tenantId', '==', tenantId));
}

/** Compound query that always includes tenantId equality first. */
export function tenantQuery(
  collectionName: string,
  tenantId: string,
  ...constraints: QueryConstraint[]
) {
  return query(
    collection(db, collectionName),
    where('tenantId', '==', tenantId),
    ...constraints,
  );
}

export async function loadTenantDocs(
  collectionName: string,
  tenantId: string,
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const snap = await getDocs(tenantCollectionQuery(collectionName, tenantId));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
}

export async function loadTenantRecords<T>(
  collectionName: string,
  tenantId: string,
  idField: 'id' | 'uid' = 'id',
): Promise<T[]> {
  const snap = await getDocs(tenantCollectionQuery(collectionName, tenantId));
  return snap.docs.map((d) => ({ ...(d.data() as T), [idField]: d.id })) as T[];
}
