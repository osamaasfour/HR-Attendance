/**
 * Golden-image provision — clone tenant settings into a new client workspace.
 * Does NOT clone users, attendance, payslips, requests, loans, or compensation.
 */

import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  Timestamp,
} from '../services/firebase';
import { DEFAULT_TENANT_ID, resolveWorkSchedule, type Tenant } from '../types';
import { omitUndefined, updateTenant } from './tenants';
import { emailSettingsDocId, payrollSettingsDocId } from './sendEmail';

export type CloneSummary = {
  payrollFormula: boolean;
  emailSettings: boolean;
  workShifts: number;
  workLocations: number;
  branches: number;
  departments: number;
  workSchedule: boolean;
};

async function loadTenantScoped(
  collectionName: string,
  sourceTenantId: string,
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const snap = await getDocs(collection(db, collectionName));
  return snap.docs
    .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
    .filter((row) => (row.data.tenantId || DEFAULT_TENANT_ID) === sourceTenantId);
}

/**
 * Clone settings from sourceTenantId into targetTenantId (already created).
 */
export async function cloneTenantSettings(input: {
  sourceTenantId: string;
  targetTenantId: string;
  /** Copy EmailJS keys — default false (secrets) */
  includeEmailSettings?: boolean;
}): Promise<CloneSummary> {
  const sourceId = input.sourceTenantId || DEFAULT_TENANT_ID;
  const targetId = input.targetTenantId;
  if (!targetId) throw new Error('Target tenant id is required.');
  if (sourceId === targetId) throw new Error('Source and target tenant must differ.');

  const summary: CloneSummary = {
    payrollFormula: false,
    emailSettings: false,
    workShifts: 0,
    workLocations: 0,
    branches: 0,
    departments: 0,
    workSchedule: false,
  };

  // 1) Overlay workSchedule / locale-ish fields from source tenant doc
  const sourceTenantSnap = await getDoc(doc(db, 'tenants', sourceId));
  if (sourceTenantSnap.exists()) {
    const src = sourceTenantSnap.data() as Tenant;
    const patch: Partial<Tenant> = {};
    if (src.workSchedule) patch.workSchedule = resolveWorkSchedule(src.workSchedule);
    if (src.timezone) patch.timezone = src.timezone;
    if (src.defaultLanguage) patch.defaultLanguage = src.defaultLanguage;
    if (src.locale) patch.locale = src.locale;
    // Do not copy logoUrl / name / slug / license from template
    if (Object.keys(patch).length > 0) {
      await updateTenant(targetId, patch);
      summary.workSchedule = !!patch.workSchedule;
    }
  }

  // 2) Payroll formula
  const formulaId = payrollSettingsDocId(sourceId);
  let formulaSnap = await getDoc(doc(db, 'payrollSettings', formulaId));
  if (!formulaSnap.exists() && sourceId === DEFAULT_TENANT_ID) {
    formulaSnap = await getDoc(doc(db, 'payrollSettings', 'default'));
  }
  if (formulaSnap.exists()) {
    const data = { ...(formulaSnap.data() as Record<string, unknown>) };
    delete data.id;
    data.tenantId = targetId;
    data.updatedAt = Timestamp.now();
    await setDoc(
      doc(db, 'payrollSettings', payrollSettingsDocId(targetId)),
      omitUndefined(data),
    );
    summary.payrollFormula = true;
  }

  // 3) Email settings (optional)
  if (input.includeEmailSettings) {
    const emailSnap = await getDoc(doc(db, 'payrollSettings', emailSettingsDocId(sourceId)));
    if (emailSnap.exists()) {
      const data = { ...(emailSnap.data() as Record<string, unknown>) };
      data.updatedAt = Timestamp.now();
      await setDoc(
        doc(db, 'payrollSettings', emailSettingsDocId(targetId)),
        omitUndefined(data),
      );
      summary.emailSettings = true;
    }
  }

  // 4) Shifts
  const shifts = await loadTenantScoped('workShifts', sourceId);
  for (const row of shifts) {
    const data = { ...row.data };
    delete data.id;
    data.tenantId = targetId;
    data.updatedAt = Timestamp.now();
    data.createdAt = data.createdAt || Timestamp.now();
    await addDoc(collection(db, 'workShifts'), omitUndefined(data));
    summary.workShifts += 1;
  }

  // 5) Work locations
  const locations = await loadTenantScoped('workLocations', sourceId);
  for (const row of locations) {
    const data = { ...row.data };
    delete data.id;
    data.tenantId = targetId;
    data.updatedAt = Timestamp.now();
    data.createdAt = data.createdAt || Timestamp.now();
    await addDoc(collection(db, 'workLocations'), omitUndefined(data));
    summary.workLocations += 1;
  }

  // 6) Branches → map old id → new id
  const branches = await loadTenantScoped('branches', sourceId);
  const branchIdMap = new Map<string, string>();
  for (const row of branches) {
    const data = { ...row.data };
    delete data.id;
    data.tenantId = targetId;
    data.updatedAt = Timestamp.now();
    data.createdAt = data.createdAt || Timestamp.now();
    const ref = await addDoc(collection(db, 'branches'), omitUndefined(data));
    branchIdMap.set(row.id, ref.id);
    summary.branches += 1;
  }

  // 7) Departments with remapped branchId
  const departments = await loadTenantScoped('departments', sourceId);
  for (const row of departments) {
    const data = { ...row.data };
    delete data.id;
    data.tenantId = targetId;
    const oldBranch = typeof data.branchId === 'string' ? data.branchId : '';
    if (oldBranch && branchIdMap.has(oldBranch)) {
      data.branchId = branchIdMap.get(oldBranch);
    } else if (oldBranch) {
      // Skip orphan dept if branch missing
      continue;
    }
    data.updatedAt = Timestamp.now();
    data.createdAt = data.createdAt || Timestamp.now();
    await addDoc(collection(db, 'departments'), omitUndefined(data));
    summary.departments += 1;
  }

  return summary;
}
