/**
 * Bulk user template download + parse/import from CSV or XLSX.
 */

import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { downloadXlsx } from './csv';
import { adminCreateEmployee } from './adminCreateEmployee';
import { nextEmployeeId } from './employeeId';
import { countTenantUsers, getTenantById } from './tenants';
import { db, doc, updateDoc, Timestamp } from '../services/firebase';
import type { Branch, Department, TaxTreatment, UserData, UserRole, Nationality } from '../types';

export const USER_TEMPLATE_COLUMNS = [
  'fullName',
  'email',
  'password',
  'role',
  'phone',
  'jobTitle',
  'branch',
  'department',
  'nationality',
  'nationalId',
  'hireDate',
  'bankName',
  'accountHolder',
  'accountNumber',
  'iban',
  'insuranceNumber',
  'taxTreatment',
] as const;

const TEMPLATE_EXAMPLE_EMAIL = 'jane@example.com';

export async function downloadUserTemplate(): Promise<void> {
  const headers = [...USER_TEMPLATE_COLUMNS];
  const example = [
    'Jane Doe',
    TEMPLATE_EXAMPLE_EMAIL,
    'Welcome@12345',
    'employee',
    '01000000000',
    'Accountant',
    'Cairo',
    'HR',
    'egyptian',
    '29001011234567',
    '2024-01-15',
    'CIB',
    'Jane Doe',
    '100012345678',
    'EG000000000000000000000000000',
    '123456789',
    'original',
  ];
  const usersSheet = XLSX.utils.aoa_to_sheet([headers, example]);
  const help = XLSX.utils.aoa_to_sheet([
    ['Instructions / تعليمات'],
    ['1. Fill the users sheet. Keep the header row. / املأ ورقة users مع الإبقاء على صف العناوين.'],
    ['2. Delete the example row (jane@example.com) before upload. / احذف صف المثال قبل الرفع.'],
    ['3. password: min 6 characters. Leave blank to auto-generate Welcome@{employeeId}.'],
    ['4. role: employee | manager | admin (default employee).'],
    ['5. nationality: egyptian | other. taxTreatment: original | form2 | form3 | other.'],
    ['6. branch and department must match names already in the app.'],
    ['7. Existing emails are updated (profile + bank). New emails create accounts.'],
    ['8. hireDate format: YYYY-MM-DD.'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, usersSheet, 'users');
  XLSX.utils.book_append_sheet(wb, help, 'instructions');
  const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }) as string;
  await downloadXlsx('users-template.xlsx', base64);
}

function normKey(k: string): string {
  return String(k || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '');
}

const KEY_ALIASES: Record<string, string> = {
  fullname: 'fullName',
  name: 'fullName',
  email: 'email',
  password: 'password',
  role: 'role',
  phone: 'phone',
  jobtitle: 'jobTitle',
  job: 'jobTitle',
  branch: 'branch',
  department: 'department',
  nationality: 'nationality',
  nationalid: 'nationalId',
  hiredate: 'hireDate',
  bankname: 'bankName',
  accountholder: 'accountHolder',
  accountnumber: 'accountNumber',
  iban: 'iban',
  insurancenumber: 'insuranceNumber',
  taxtreatment: 'taxTreatment',
};

function mapRow(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const mapped = KEY_ALIASES[normKey(k)];
    if (!mapped) continue;
    out[mapped] = v == null ? '' : String(v).trim();
  }
  return out;
}

export async function readUserUploadRows(uri: string): Promise<Record<string, string>[]> {
  let wb: XLSX.WorkBook;
  try {
    const res = await fetch(uri);
    const buf = await res.arrayBuffer();
    wb = XLSX.read(buf, { type: 'array' });
  } catch {
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    wb = XLSX.read(b64, { type: 'base64' });
  }
  const name = wb.SheetNames.includes('users') ? 'users' : wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  return json.map(mapRow).filter((r) => r.fullName || r.email);
}

function parseRole(raw?: string): UserRole {
  const s = (raw || '').toLowerCase();
  if (s === 'manager' || s === 'admin' || s === 'employee') return s;
  return 'employee';
}

function parseNationality(raw?: string): Nationality {
  const s = (raw || '').toLowerCase();
  if (s === 'other' || s === 'غير مصري') return 'other';
  return 'egyptian';
}

function parseTax(raw?: string): TaxTreatment | undefined {
  const s = (raw || '').toLowerCase().replace(/\s+/g, '');
  if (s === 'form2' || s === '2') return 'form2';
  if (s === 'form3' || s === '3') return 'form3';
  if (s === 'other' || s === '4') return 'other';
  if (s === 'original' || s === '1') return 'original';
  return undefined;
}

function matchByName<T extends { id: string; name: string }>(
  list: T[],
  name?: string,
): T | undefined {
  const q = (name || '').trim().toLowerCase();
  if (!q) return undefined;
  return list.find((x) => x.name.trim().toLowerCase() === q);
}

export type BulkUserResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export async function importUserRows(opts: {
  rows: Record<string, string>[];
  tenantId: string;
  existingUsers: UserData[];
  branches: Branch[];
  departments: Department[];
}): Promise<BulkUserResult> {
  const result: BulkUserResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  const usedIds = opts.existingUsers.map((u) => u.employeeId);
  const byEmail = new Map(
    opts.existingUsers.map((u) => [(u.email || '').trim().toLowerCase(), u]),
  );

  const tenantDoc = await getTenantById(opts.tenantId);
  const max = tenantDoc?.maxUsers;
  let usedSeats = await countTenantUsers(opts.tenantId);

  for (let i = 0; i < opts.rows.length; i++) {
    const row = opts.rows[i];
    const line = i + 2;
    const email = (row.email || '').trim().toLowerCase();
    const fullName = (row.fullName || '').trim();
    if (!email && !fullName) {
      result.skipped += 1;
      continue;
    }
    if (email === TEMPLATE_EXAMPLE_EMAIL) {
      result.skipped += 1;
      continue;
    }
    if (!email || !fullName) {
      result.skipped += 1;
      result.errors.push(`Row ${line}: fullName and email are required.`);
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      result.skipped += 1;
      result.errors.push(`Row ${line}: invalid email (${email}).`);
      continue;
    }

    const branch = matchByName(opts.branches, row.branch);
    const depts = branch
      ? opts.departments.filter((d) => d.branchId === branch.id)
      : opts.departments;
    const dept = matchByName(depts, row.department);
    const tax = parseTax(row.taxTreatment);
    const existing = byEmail.get(email);

    const bank: Partial<{
      bankName: string;
      accountHolder: string;
      accountNumber: string;
      iban: string;
    }> = {};
    if (row.bankName) bank.bankName = row.bankName;
    if (row.accountHolder) bank.accountHolder = row.accountHolder;
    if (row.accountNumber) bank.accountNumber = row.accountNumber;
    if (row.iban) bank.iban = row.iban;

    try {
      if (existing) {
        await updateDoc(doc(db, 'users', existing.uid), {
          fullName,
          ...(row.phone ? { phone: row.phone } : {}),
          ...(row.jobTitle ? { jobTitle: row.jobTitle } : {}),
          ...(branch
            ? { branchId: branch.id, branchName: branch.name }
            : {}),
          ...(dept
            ? { departmentId: dept.id, department: dept.name }
            : {}),
          ...(row.nationality ? { nationality: parseNationality(row.nationality) } : {}),
          ...(row.nationalId ? { nationalId: row.nationalId } : {}),
          ...(row.hireDate ? { hireDate: row.hireDate } : {}),
          ...(row.insuranceNumber ? { insuranceNumber: row.insuranceNumber } : {}),
          ...(tax ? { taxTreatment: tax } : {}),
          ...bank,
          updatedAt: Timestamp.now(),
        });
        result.updated += 1;
        continue;
      }

      if (max && max > 0 && usedSeats >= max) {
        result.skipped += 1;
        result.errors.push(`Row ${line}: seat limit reached.`);
        continue;
      }

      const employeeId = nextEmployeeId(usedIds);
      usedIds.push(employeeId);
      const password =
        (row.password || '').length >= 6 ? row.password : `Welcome@${employeeId}`;

      const created = await adminCreateEmployee({
        email,
        password,
        fullName,
        employeeId,
        role: parseRole(row.role),
        tenantId: opts.tenantId,
        phone: row.phone,
        jobTitle: row.jobTitle,
        branchId: branch?.id || null,
        branchName: branch?.name || null,
        departmentId: dept?.id || null,
        department: dept?.name || null,
        nationality: parseNationality(row.nationality),
        nationalId: row.nationalId,
        hireDate: row.hireDate,
        insuranceNumber: row.insuranceNumber,
        taxTreatment: tax,
        ...bank,
      });
      byEmail.set(email, created);
      usedSeats += 1;
      result.created += 1;
    } catch (e: any) {
      result.skipped += 1;
      result.errors.push(`Row ${line} (${email}): ${e?.message || 'failed'}`);
    }
  }

  return result;
}
