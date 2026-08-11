/**
 * Employee IDs: 00001 … 99999 (5-digit zero-padded).
 * Legacy EMP001 / EMP1 / "1" are normalized to the same range.
 */

export const EMPLOYEE_ID_MIN = 1;
export const EMPLOYEE_ID_MAX = 99999;

/** Parse EMP001, 1, 00001, etc. → number or null */
export function parseEmployeeIdNumber(raw: string | null | undefined): number | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const emp = s.match(/^EMP(\d+)$/i);
  if (emp) {
    const n = Number(emp[1]);
    return Number.isFinite(n) ? n : null;
  }
  if (/^\d{1,5}$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function formatEmployeeId(n: number): string {
  const num = Math.floor(n);
  if (!Number.isFinite(num) || num < EMPLOYEE_ID_MIN || num > EMPLOYEE_ID_MAX) {
    throw new Error(`Employee ID must be between ${EMPLOYEE_ID_MIN} and ${EMPLOYEE_ID_MAX}.`);
  }
  return String(num).padStart(5, '0');
}

/** Convert any legacy/new form to 00001…99999, or null if invalid */
export function normalizeEmployeeId(raw: string | null | undefined): string | null {
  const n = parseEmployeeIdNumber(raw);
  if (n == null || n < EMPLOYEE_ID_MIN || n > EMPLOYEE_ID_MAX) return null;
  return formatEmployeeId(n);
}

export function isValidEmployeeId(id: string): boolean {
  return /^[0-9]{5}$/.test(id) && Number(id) >= EMPLOYEE_ID_MIN && Number(id) <= EMPLOYEE_ID_MAX;
}

/** Next free ID from existing list (handles EMP* and numeric). */
export function nextEmployeeId(existingIds: Array<string | null | undefined>): string {
  const nums = existingIds
    .map((id) => parseEmployeeIdNumber(id))
    .filter((n): n is number => n != null && n >= EMPLOYEE_ID_MIN);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  if (next > EMPLOYEE_ID_MAX) {
    throw new Error(`Employee ID limit reached (${EMPLOYEE_ID_MAX}).`);
  }
  return formatEmployeeId(next);
}

/** True if stored value should be rewritten to canonical 5-digit form */
export function needsEmployeeIdMigration(raw: string | null | undefined): boolean {
  const normalized = normalizeEmployeeId(raw);
  if (!normalized) return false;
  return String(raw || '').trim() !== normalized;
}
