import { type WeekdayNumber, type WorkSchedule } from '../types';

export const WEEKDAY_KEYS: { day: WeekdayNumber; labelKey: string }[] = [
  { day: 0, labelKey: 'daySun' },
  { day: 1, labelKey: 'dayMon' },
  { day: 2, labelKey: 'dayTue' },
  { day: 3, labelKey: 'dayWed' },
  { day: 4, labelKey: 'dayThu' },
  { day: 5, labelKey: 'dayFri' },
  { day: 6, labelKey: 'daySat' },
];

const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidHm(value: string): boolean {
  return HM_RE.test(value.trim());
}

export function toggleOffDay(prev: WeekdayNumber[], day: WeekdayNumber): WeekdayNumber[] {
  if (prev.includes(day)) return prev.filter((d) => d !== day);
  return [...prev, day].sort((a, b) => a - b) as WeekdayNumber[];
}

export type ScheduleParseError =
  | 'invalidWorkTime'
  | 'invalidFullDayHours'
  | 'invalidLateGrace'
  | 'needOneWorkingDay';

export function parseWorkScheduleInput(input: {
  workStart: string;
  workEnd: string;
  fullDayHours: string;
  lateGraceMinutes: string;
  weeklyOffDays: WeekdayNumber[];
}): { ok: true; schedule: WorkSchedule } | { ok: false; error: ScheduleParseError } {
  const start = input.workStart.trim();
  const end = input.workEnd.trim();
  if (!isValidHm(start) || !isValidHm(end)) {
    return { ok: false, error: 'invalidWorkTime' };
  }

  const hours = Number(input.fullDayHours);
  const grace = Number(input.lateGraceMinutes);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return { ok: false, error: 'invalidFullDayHours' };
  }
  if (!Number.isFinite(grace) || grace < 0 || grace > 180) {
    return { ok: false, error: 'invalidLateGrace' };
  }
  if (input.weeklyOffDays.length >= 7) {
    return { ok: false, error: 'needOneWorkingDay' };
  }

  return {
    ok: true,
    schedule: {
      workStart: start,
      workEnd: end,
      fullDayHours: Math.round(hours * 100) / 100,
      lateGraceMinutes: Math.round(grace),
      weeklyOffDays: [...input.weeklyOffDays],
    },
  };
}
