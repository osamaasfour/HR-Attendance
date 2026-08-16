/**
 * Shared reporting helpers — period filters, absences, vacation balances.
 */

import {
  computeRemainingVacation,
  resolveAnnualLeaveAllowance,
  resolveLeaveBalanceAdjustment,
} from './leaveBalance';
import { resolveWorkSchedule, workShiftToSchedule, type WorkSchedule, type WorkShift } from '../types';
import type { AttendanceRecord, HrRequest, UserData } from '../types';

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Shift YYYY-MM by N months. */
export function shiftPeriod(period: string, deltaMonths: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1 + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatPeriodLabel(period: string, locale = 'en-US'): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
}

export function periodBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    start: `${period}-01`,
    end: `${period}-${String(last).padStart(2, '0')}`,
  };
}

export function inDateRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function filterAttendanceByPeriod(
  records: AttendanceRecord[],
  period: string,
): AttendanceRecord[] {
  const { start, end } = periodBounds(period);
  return records.filter((r) => r.date && inDateRange(r.date, start, end));
}

export function filterDelays(records: AttendanceRecord[]): AttendanceRecord[] {
  return records.filter(
    (r) => (r.lateMinutes || 0) > 0 || (r.earlyLeaveMinutes || 0) > 0,
  );
}

export function filterRequestsByPeriod(
  requests: HrRequest[],
  period: string,
): HrRequest[] {
  const { start, end } = periodBounds(period);
  return requests.filter((r) => {
    const s = r.startDate || '';
    const e = r.endDate || r.startDate || '';
    return (s && inDateRange(s, start, end)) || (e && inDateRange(e, start, end));
  });
}

export function vacationUsedInYear(
  requests: HrRequest[],
  userId: string,
  year: number,
): number {
  return requests
    .filter(
      (r) =>
        r.userId === userId &&
        r.status === 'approved' &&
        r.type === 'vacation' &&
        (r.startDate || '').startsWith(String(year)),
    )
    .reduce((s, r) => s + (r.days || 0), 0);
}

export function vacationLedgerForUser(
  requests: HrRequest[],
  userId: string,
  year: number,
): HrRequest[] {
  return requests
    .filter(
      (r) =>
        r.userId === userId &&
        r.type === 'vacation' &&
        (r.startDate || '').startsWith(String(year)),
    )
    .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
}

export interface VacationBalanceRow {
  userId: string;
  employeeId: string;
  fullName: string;
  allowance: number;
  used: number;
  adjustment: number;
  remaining: number;
}

export function buildVacationBalances(
  users: UserData[],
  requests: HrRequest[],
  year = new Date().getFullYear(),
): VacationBalanceRow[] {
  return users
    .filter((u) => u.active !== false && (u.role === 'employee' || u.role === 'manager'))
    .map((u) => {
      const used = vacationUsedInYear(requests, u.uid, year);
      const allowance = resolveAnnualLeaveAllowance(u);
      const adjustment = resolveLeaveBalanceAdjustment(u);
      return {
        userId: u.uid,
        employeeId: u.employeeId || '',
        fullName: u.fullName || '',
        allowance,
        used,
        adjustment,
        remaining: computeRemainingVacation(allowance, used, adjustment),
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function scheduleForUser(
  user: UserData,
  shiftsById: Map<string, WorkShift>,
  tenantSchedule?: WorkSchedule | null,
): WorkSchedule {
  const shift = user.workShiftId ? shiftsById.get(user.workShiftId) : undefined;
  if (shift) return workShiftToSchedule(shift);
  return resolveWorkSchedule(tenantSchedule);
}

/**
 * Count absent working days in period (before today) with no punch and not covered by leave.
 */
export function countAbsencesForUser(input: {
  user: UserData;
  period: string;
  attendance: AttendanceRecord[];
  requests: HrRequest[];
  shiftsById: Map<string, WorkShift>;
  tenantSchedule?: WorkSchedule | null;
  holidayDates?: Set<string>;
}): { absentDays: number; absentDates: string[] } {
  const { start, end } = periodBounds(input.period);
  const schedule = scheduleForUser(input.user, input.shiftsById, input.tenantSchedule);
  const weeklyOff = schedule.weeklyOffDays || [0, 6];
  const presentDates = new Set(
    input.attendance
      .filter((a) => a.userId === input.user.uid && inDateRange(a.date, start, end))
      .map((a) => a.date),
  );

  const covered = new Set<string>();
  input.requests
    .filter(
      (r) =>
        r.userId === input.user.uid &&
        r.status === 'approved' &&
        ['vacation', 'sick', 'business_trip'].includes(r.type),
    )
    .forEach((r) => {
      const d = new Date((r.startDate || '') + 'T00:00:00');
      const last = new Date((r.endDate || r.startDate || '') + 'T00:00:00');
      if (Number.isNaN(d.getTime()) || Number.isNaN(last.getTime())) return;
      while (d <= last) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        covered.add(key);
        d.setDate(d.getDate() + 1);
      }
    });

  const absentDates: string[] = [];
  const cursor = new Date(start + 'T00:00:00');
  const lastDay = new Date(end + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  while (cursor <= lastDay && cursor < today) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const isOff = weeklyOff.includes(cursor.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6);
    const isHoliday = Boolean(input.holidayDates?.has(key));
    if (!isOff && !isHoliday && !presentDates.has(key) && !covered.has(key)) {
      absentDates.push(key);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { absentDays: absentDates.length, absentDates };
}

/** Timestamp → date+time (legacy / when date column is absent). */
export function formatTs(ts: { toDate?: () => Date } | null | undefined): string {
  try {
    const d = ts?.toDate?.();
    return d ? d.toLocaleString() : '';
  } catch {
    return '';
  }
}

/** Timestamp → time only (use when date is already a separate column). */
export function formatTsTime(ts: { toDate?: () => Date } | null | undefined): string {
  try {
    const d = ts?.toDate?.();
    if (!d) return '';
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}
