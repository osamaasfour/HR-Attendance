/**
 * One-time / on-load migration: EMP001 → 00001 (and denormalized copies).
 */

import {
  db,
  collection,
  getDocs,
  updateDoc,
  doc,
  Timestamp,
} from '../services/firebase';
import { needsEmployeeIdMigration, normalizeEmployeeId } from './employeeId';
import type { UserData } from '../types';

const DENORMALIZED_COLLECTIONS = ['attendance', 'hrRequests', 'payslips', 'loans'] as const;

export async function migrateTenantEmployeeIds(
  users: UserData[],
): Promise<{ migrated: number }> {
  const renames = new Map<string, string>();

  for (const u of users) {
    if (!needsEmployeeIdMigration(u.employeeId)) continue;
    const next = normalizeEmployeeId(u.employeeId);
    if (!next) continue;
    renames.set(u.uid, next);
  }

  if (renames.size === 0) return { migrated: 0 };

  await Promise.all(
    [...renames.entries()].map(([uid, employeeId]) =>
      updateDoc(doc(db, 'users', uid), {
        employeeId,
        updatedAt: Timestamp.now(),
      }),
    ),
  );

  await Promise.all(
    DENORMALIZED_COLLECTIONS.map(async (col) => {
      const snap = await getDocs(collection(db, col));
      const updates = snap.docs
        .map((d) => {
          const data = d.data() as { userId?: string; employeeId?: string };
          const next = data.userId ? renames.get(data.userId) : undefined;
          if (!next || data.employeeId === next) return null;
          return updateDoc(doc(db, col, d.id), { employeeId: next });
        })
        .filter(Boolean) as Promise<void>[];
      await Promise.all(updates);
    }),
  );

  return { migrated: renames.size };
}
