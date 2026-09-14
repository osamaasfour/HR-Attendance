/**
 * Golden-image provision — clone tenant settings into a new client workspace.
 * Does NOT clone users, attendance, payslips, requests, loans, or compensation.
 */

import {
  db,
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  Timestamp,
} from '../services/firebase';
import { DEFAULT_EMAIL_SETTINGS, DEFAULT_TENANT_ID, resolveWorkSchedule, type EmailSettings, type Tenant } from '../types';
import { omitUndefined, updateTenant } from './tenants';
import { emailSettingsDocId, payrollSettingsDocId, publishEmailPublic } from './sendEmail';
import { loadTenantDocs } from './tenantScope';

export type CloneSummary = {
  payrollFormula: boolean;
  emailSettings: boolean;
  workShifts: number;
  workLocations: number;
  branches: number;
  departments: number;
  workSchedule: boolean;
};

const SECRET_KEYS = new Set([
  'privateKey',
  'accessToken',
  'password',
  'deviceSecret',
  'smtpPassword',
]);

function cloneDocData(
  source: Record<string, unknown>,
  targetTenantId: string,
  extraOmit: string[] = [],
): Record<string, unknown> {
  const data = { ...source };
  delete data.id;
  for (const key of extraOmit) delete data[key];
  for (const key of SECRET_KEYS) delete data[key];
  data.tenantId = targetTenantId;
  data.updatedAt = Timestamp.now();
  data.createdAt = data.createdAt || Timestamp.now();
  return omitUndefined(data) as Record<string, unknown>;
}

async function cloneSimpleCollection(
  collectionName: string,
  sourceId: string,
  targetId: string,
): Promise<number> {
  const rows = await loadTenantDocs(collectionName, sourceId);
  await Promise.all(
    rows.map((row) =>
      addDoc(collection(db, collectionName), cloneDocData(row.data, targetId)),
    ),
  );
  return rows.length;
}

/**
 * Clone settings from sourceTenantId into targetTenantId (already created).
 * EmailJS private keys are never copied.
 */
export async function cloneTenantSettings(input: {
  sourceTenantId: string;
  targetTenantId: string;
  /** Copy EmailJS public IDs — private keys are always stripped */
  includeEmailSettings?: boolean;
}): Promise<CloneSummary> {
  const sourceId = input.sourceTenantId || DEFAULT_TENANT_ID;
  const targetId = input.targetTenantId?.trim();
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

  const sourceTenantSnap = await getDoc(doc(db, 'tenants', sourceId));
  if (sourceTenantSnap.exists()) {
    const src = sourceTenantSnap.data() as Tenant;
    const patch: Partial<Tenant> = {};
    if (src.workSchedule) patch.workSchedule = resolveWorkSchedule(src.workSchedule);
    if (src.timezone) patch.timezone = src.timezone;
    if (src.defaultLanguage) patch.defaultLanguage = src.defaultLanguage;
    if (src.locale) patch.locale = src.locale;
    if (Object.keys(patch).length > 0) {
      await updateTenant(targetId, patch);
      summary.workSchedule = !!patch.workSchedule;
    }
  }

  const formulaId = payrollSettingsDocId(sourceId);
  let formulaSnap = await getDoc(doc(db, 'payrollSettings', formulaId));
  if (!formulaSnap.exists() && sourceId === DEFAULT_TENANT_ID) {
    formulaSnap = await getDoc(doc(db, 'payrollSettings', 'default'));
  }
  if (formulaSnap.exists()) {
    const data = cloneDocData(formulaSnap.data() as Record<string, unknown>, targetId);
    await setDoc(doc(db, 'payrollSettings', payrollSettingsDocId(targetId)), data);
    summary.payrollFormula = true;
  }

  if (input.includeEmailSettings) {
    const emailSnap = await getDoc(doc(db, 'payrollSettings', emailSettingsDocId(sourceId)));
    if (emailSnap.exists()) {
      const data = cloneDocData(emailSnap.data() as Record<string, unknown>, targetId, [
        'updatedBy',
        'privateKey',
      ]);
      data.enabled = false;
      await setDoc(doc(db, 'payrollSettings', emailSettingsDocId(targetId)), data);
      await publishEmailPublic(targetId, { ...DEFAULT_EMAIL_SETTINGS, ...data } as EmailSettings);
      summary.emailSettings = true;
    }
  }

  const [shifts, locations] = await Promise.all([
    cloneSimpleCollection('workShifts', sourceId, targetId),
    cloneSimpleCollection('workLocations', sourceId, targetId),
  ]);
  summary.workShifts = shifts;
  summary.workLocations = locations;

  const branches = await loadTenantDocs('branches', sourceId);
  const branchIdMap = new Map<string, string>();
  const branchResults = await Promise.all(
    branches.map(async (row) => {
      const ref = await addDoc(
        collection(db, 'branches'),
        cloneDocData(row.data, targetId),
      );
      return [row.id, ref.id] as const;
    }),
  );
  for (const [oldId, newId] of branchResults) branchIdMap.set(oldId, newId);
  summary.branches = branches.length;

  const departments = await loadTenantDocs('departments', sourceId);
  const deptsToWrite = departments.flatMap((row) => {
    const data = cloneDocData(row.data, targetId);
    const oldBranch = typeof data.branchId === 'string' ? data.branchId : '';
    if (oldBranch && branchIdMap.has(oldBranch)) {
      data.branchId = branchIdMap.get(oldBranch);
    } else if (oldBranch) {
      return [];
    }
    return [data];
  });
  await Promise.all(
    deptsToWrite.map((data) => addDoc(collection(db, 'departments'), data)),
  );
  summary.departments = deptsToWrite.length;

  return summary;
}
