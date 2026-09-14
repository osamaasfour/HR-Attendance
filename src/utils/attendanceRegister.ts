/**
 * Combined monthly attendance register — one cell per employee per day.
 */

import {
  resolveWorkSchedule,
  workShiftToSchedule,
  type Holiday,
  type HrRequest,
  type HrRequestType,
  type UserData,
  type WorkSchedule,
  type WorkShift,
} from '../types';
import type { AttendanceRecord } from '../types';
import { findHolidayOnDate } from './holidays';
import { formatTsTime, periodBounds } from './reports';

export type DayCode =
  | 'P'
  | 'L'
  | 'E'
  | 'LE'
  | 'V'
  | 'S'
  | 'U'
  | 'T'
  | 'H'
  | 'W'
  | 'A'
  | '-';

export type DayCell = {
  date: string;
  code: DayCode;
  lateMinutes?: number;
  earlyLeaveMinutes?: number;
  holidayName?: string;
  clockIn?: string;
  clockOut?: string;
};

export type RegisterTotals = {
  present: number;
  late: number;
  early: number;
  vacation: number;
  sick: number;
  unpaid: number;
  trip: number;
  absent: number;
  holiday: number;
  weekend: number;
};

export type AttendanceRegisterRow = {
  userId: string;
  employeeId: string;
  fullName: string;
  branchName?: string;
  department?: string;
  cells: DayCell[];
  totals: RegisterTotals;
};

export type AttendanceRegister = {
  period: string;
  dates: string[];
  rows: AttendanceRegisterRow[];
  grand: RegisterTotals;
};

export const DAY_CODE_COLORS: Record<DayCode, { bg: string; fg: string }> = {
  P: { bg: '#CCFBF1', fg: '#115E59' },
  L: { bg: '#FEF3C7', fg: '#92400E' },
  E: { bg: '#FFEDD5', fg: '#9A3412' },
  LE: { bg: '#FDE68A', fg: '#78350F' },
  V: { bg: '#DBEAFE', fg: '#1E40AF' },
  S: { bg: '#EDE9FE', fg: '#5B21B6' },
  U: { bg: '#FCE7F3', fg: '#9D174D' },
  T: { bg: '#E0E7FF', fg: '#3730A3' },
  H: { bg: '#D1FAE5', fg: '#065F46' },
  W: { bg: '#F1F5F9', fg: '#64748B' },
  A: { bg: '#FEE2E2', fg: '#B91C1C' },
  '-': { bg: '#FFFFFF', fg: '#94A3B8' },
};

const LEAVE_TYPES: HrRequestType[] = ['vacation', 'sick', 'unpaid', 'business_trip'];
const LEAVE_PRIORITY: Record<string, number> = {
  vacation: 4,
  sick: 3,
  unpaid: 2,
  business_trip: 1,
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function periodDateList(period: string): string[] {
  const { start, end } = periodBounds(period);
  const out: string[] = [];
  const cursor = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cursor <= last) {
    out.push(ymd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function emptyRegisterTotals(): RegisterTotals {
  return {
    present: 0,
    late: 0,
    early: 0,
    vacation: 0,
    sick: 0,
    unpaid: 0,
    trip: 0,
    absent: 0,
    holiday: 0,
    weekend: 0,
  };
}

export function addRegisterTotals(a: RegisterTotals, b: RegisterTotals): RegisterTotals {
  return {
    present: a.present + b.present,
    late: a.late + b.late,
    early: a.early + b.early,
    vacation: a.vacation + b.vacation,
    sick: a.sick + b.sick,
    unpaid: a.unpaid + b.unpaid,
    trip: a.trip + b.trip,
    absent: a.absent + b.absent,
    holiday: a.holiday + b.holiday,
    weekend: a.weekend + b.weekend,
  };
}

function bumpTotals(totals: RegisterTotals, code: DayCode) {
  if (code === 'P' || code === 'L' || code === 'E' || code === 'LE') totals.present += 1;
  if (code === 'L' || code === 'LE') totals.late += 1;
  if (code === 'E' || code === 'LE') totals.early += 1;
  if (code === 'V') totals.vacation += 1;
  if (code === 'S') totals.sick += 1;
  if (code === 'U') totals.unpaid += 1;
  if (code === 'T') totals.trip += 1;
  if (code === 'A') totals.absent += 1;
  if (code === 'H') totals.holiday += 1;
  if (code === 'W') totals.weekend += 1;
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

function leaveCode(type: HrRequestType | undefined): DayCode | null {
  if (type === 'vacation') return 'V';
  if (type === 'sick') return 'S';
  if (type === 'unpaid') return 'U';
  if (type === 'business_trip') return 'T';
  return null;
}

function punchCode(record: AttendanceRecord | undefined): DayCode | null {
  if (!record?.clockIn) return null;
  const late = (record.lateMinutes || 0) > 0;
  const early = (record.earlyLeaveMinutes || 0) > 0;
  if (late && early) return 'LE';
  if (late) return 'L';
  if (early) return 'E';
  return 'P';
}

function leaveByUserDate(requests: HrRequest[]): Map<string, HrRequestType> {
  const map = new Map<string, HrRequestType>();
  requests
    .filter((r) => r.status === 'approved' && LEAVE_TYPES.includes(r.type))
    .forEach((r) => {
      const start = new Date((r.startDate || '') + 'T00:00:00');
      const end = new Date((r.endDate || r.startDate || '') + 'T00:00:00');
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
      const cursor = new Date(start);
      while (cursor <= end) {
        const key = `${r.userId}|${ymd(cursor)}`;
        const existing = map.get(key);
        if (!existing || (LEAVE_PRIORITY[r.type] || 0) > (LEAVE_PRIORITY[existing] || 0)) {
          map.set(key, r.type);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    });
  return map;
}

function attendanceByUserDate(records: AttendanceRecord[]): Map<string, AttendanceRecord> {
  const map = new Map<string, AttendanceRecord>();
  records.forEach((r) => {
    if (!r.userId || !r.date) return;
    const key = `${r.userId}|${r.date}`;
    const prev = map.get(key);
    if (!prev || (r.clockIn && !prev.clockIn)) map.set(key, r);
  });
  return map;
}

function classifyDay(opts: {
  date: string;
  today: string;
  weeklyOff: number[];
  holiday?: Holiday;
  leaveType?: HrRequestType;
  punch?: AttendanceRecord;
}): DayCell {
  const { date, today, weeklyOff, holiday, leaveType, punch } = opts;
  const dow = new Date(date + 'T00:00:00').getDay();
  const isWeekend = weeklyOff.includes(dow);
  const holidayName = holiday?.name;

  if (date > today) {
    return { date, code: '-', holidayName };
  }

  const punched = punchCode(punch);
  if (punched) {
    return {
      date,
      code: punched,
      lateMinutes: punch?.lateMinutes,
      earlyLeaveMinutes: punch?.earlyLeaveMinutes,
      holidayName,
      clockIn: formatTsTime(punch?.clockIn),
      clockOut: formatTsTime(punch?.clockOut),
    };
  }

  if (holiday) return { date, code: 'H', holidayName };
  if (isWeekend) return { date, code: 'W', holidayName };

  const leave = leaveCode(leaveType);
  if (leave) return { date, code: leave, holidayName };

  if (date < today) return { date, code: 'A', holidayName };
  return { date, code: '-', holidayName };
}

export function buildAttendanceRegister(opts: {
  period: string;
  users: UserData[];
  attendance: AttendanceRecord[];
  requests: HrRequest[];
  holidays: Holiday[];
  shiftsById: Map<string, WorkShift>;
  tenantSchedule?: WorkSchedule | null;
}): AttendanceRegister {
  const dates = periodDateList(opts.period);
  const punches = attendanceByUserDate(opts.attendance);
  const leaves = leaveByUserDate(opts.requests);
  const today = ymd(new Date());

  const rows = [...opts.users]
    .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''))
    .map((user) => {
      const schedule = scheduleForUser(user, opts.shiftsById, opts.tenantSchedule);
      const weeklyOff = schedule.weeklyOffDays || [0, 6];
      const totals = emptyRegisterTotals();
      const cells = dates.map((date) => {
        const cell = classifyDay({
          date,
          today,
          weeklyOff,
          holiday: findHolidayOnDate(date, opts.holidays),
          leaveType: leaves.get(`${user.uid}|${date}`),
          punch: punches.get(`${user.uid}|${date}`),
        });
        bumpTotals(totals, cell.code);
        return cell;
      });
      return {
        userId: user.uid,
        employeeId: user.employeeId || '',
        fullName: user.fullName || '',
        branchName: user.branchName,
        department: user.department,
        cells,
        totals,
      };
    });

  return {
    period: opts.period,
    dates,
    rows,
    grand: rows.reduce((acc, row) => addRegisterTotals(acc, row.totals), emptyRegisterTotals()),
  };
}
