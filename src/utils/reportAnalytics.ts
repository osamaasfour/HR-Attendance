/**
 * Report aggregations — filters, daily series, payroll totals, leave counts.
 */

import type {
  AttendanceRecord,
  HrRequest,
  Payslip,
  UserData,
  WeekdayNumber,
} from '../types';
import { periodBounds } from './reports';

export type ReportUserFilters = {
  branchId?: string;
  departmentId?: string;
  employeeQuery?: string;
};

export function filterReportUsers(
  users: UserData[],
  filters: ReportUserFilters,
): UserData[] {
  const q = (filters.employeeQuery || '').trim().toLowerCase();
  return users.filter((u) => {
    if (u.active === false) return false;
    if (u.role !== 'employee' && u.role !== 'manager') return false;
    if (filters.branchId && u.branchId !== filters.branchId) return false;
    if (filters.departmentId && u.departmentId !== filters.departmentId) return false;
    if (q) {
      const name = (u.fullName || '').toLowerCase();
      const id = (u.employeeId || '').toLowerCase();
      if (!name.includes(q) && !id.includes(q)) return false;
    }
    return true;
  });
}

export function userIdSet(users: UserData[]): Set<string> {
  return new Set(users.map((u) => u.uid));
}

export type DailyAttendancePoint = {
  date: string;
  label: string;
  present: number;
  late: number;
  absent: number;
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function datesInPeriod(period: string, untilToday = true): string[] {
  const { start, end } = periodBounds(period);
  const out: string[] = [];
  const cursor = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  while (cursor <= last) {
    if (!untilToday || cursor <= today) out.push(ymd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function lastNDateKeys(n: number, from = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    out.push(ymd(d));
  }
  return out;
}

export function weekdayShort(date: string, locale = 'en-US'): string {
  const d = new Date(date + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return date.slice(8);
  return d.toLocaleDateString(locale, { weekday: 'short' });
}

export function buildDailyAttendanceSeries(opts: {
  period: string;
  userIds: Set<string>;
  attendance: AttendanceRecord[];
  weeklyOffDays?: WeekdayNumber[];
  holidayDates?: Set<string>;
}): DailyAttendancePoint[] {
  const workforce = opts.userIds.size;
  const off = Array.isArray(opts.weeklyOffDays) ? opts.weeklyOffDays : [];
  const holidays = opts.holidayDates;
  const byDate = new Map<string, AttendanceRecord[]>();
  opts.attendance.forEach((r) => {
    if (!r.date || !opts.userIds.has(r.userId)) return;
    const list = byDate.get(r.date) || [];
    list.push(r);
    byDate.set(r.date, list);
  });

  return datesInPeriod(opts.period).map((date) => {
    const recs = byDate.get(date) || [];
    const punched = new Set<string>();
    let late = 0;
    let present = 0;
    recs.forEach((r) => {
      if (!r.clockIn || punched.has(r.userId)) return;
      punched.add(r.userId);
      if ((r.lateMinutes || 0) > 0) late += 1;
      else present += 1;
    });
    const dow = new Date(date + 'T00:00:00').getDay() as WeekdayNumber;
    const isOff = off.includes(dow) || Boolean(holidays?.has(date));
    const absent = isOff ? 0 : Math.max(0, workforce - punched.size);
    return {
      date,
      label: date.slice(8),
      present,
      late,
      absent,
    };
  });
}

export function buildWeekAttendanceBars(opts: {
  dates: string[];
  userIds: Set<string>;
  attendance: AttendanceRecord[];
  weeklyOffDays?: WeekdayNumber[];
  holidayDates?: Set<string>;
  locale?: string;
}): DailyAttendancePoint[] {
  const workforce = opts.userIds.size;
  const off = Array.isArray(opts.weeklyOffDays) ? opts.weeklyOffDays : [];
  return opts.dates.map((date) => {
    const recs = opts.attendance.filter((r) => r.date === date && opts.userIds.has(r.userId));
    const punched = new Set(recs.filter((r) => r.clockIn).map((r) => r.userId));
    const dow = new Date(date + 'T00:00:00').getDay() as WeekdayNumber;
    const isOff = off.includes(dow) || Boolean(opts.holidayDates?.has(date));
    return {
      date,
      label: weekdayShort(date, opts.locale),
      present: punched.size,
      late: 0,
      absent: isOff ? 0 : Math.max(0, workforce - punched.size),
    };
  });
}

export type AttendanceKpis = {
  presentDays: number;
  latePunches: number;
  earlyLeaves: number;
  absentDays: number;
};

export function attendanceKpis(
  records: AttendanceRecord[],
  absentWorkingDays: number,
): AttendanceKpis {
  return {
    presentDays: records.filter((r) => r.clockIn).length,
    latePunches: records.filter((r) => (r.lateMinutes || 0) > 0).length,
    earlyLeaves: records.filter((r) => (r.earlyLeaveMinutes || 0) > 0).length,
    absentDays: absentWorkingDays,
  };
}

export type PayrollKpis = {
  headcount: number;
  gross: number;
  employeeSi: number;
  tax: number;
  net: number;
  deductions: number;
};

export function payrollKpis(slips: Payslip[]): PayrollKpis {
  return slips.reduce(
    (acc, p) => {
      acc.headcount += 1;
      acc.gross += Number(p.monthlyBaseEarnings ?? p.grossPay) || 0;
      acc.employeeSi += Number(p.employeeInsurance) || 0;
      acc.tax += Number(p.incomeTax) || 0;
      acc.net += Number(p.netPay) || 0;
      acc.deductions += Number(p.totalDeductions) || 0;
      return acc;
    },
    { headcount: 0, gross: 0, employeeSi: 0, tax: 0, net: 0, deductions: 0 },
  );
}

export function topPayslipsByNet(slips: Payslip[], limit = 8): Payslip[] {
  return [...slips].sort((a, b) => (b.netPay || 0) - (a.netPay || 0)).slice(0, limit);
}

export function leaveTypeCounts(requests: HrRequest[]): Record<string, number> {
  const out: Record<string, number> = {};
  requests.forEach((r) => {
    const k = r.type || 'other';
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

export function money(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
