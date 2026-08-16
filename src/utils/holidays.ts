/**
 * Company holiday matching — date ranges, one-off or recurring month-day span.
 */

import { db, collection, getDocs, query, where } from '../services/firebase';
import type { Holiday } from '../types';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseYmd(ymd: string): Date | null {
  if (!YMD.test(ymd || '')) return null;
  const d = new Date(ymd + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

function inclusiveDayCount(startYmd: string, endYmd: string): number {
  const a = parseYmd(startYmd);
  const b = parseYmd(endYmd);
  if (!a || !b) return 1;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

export function holidayMonthDay(ymd: string): string {
  return (ymd || '').slice(5, 10);
}

export function holidayStart(holiday: Pick<Holiday, 'startDate' | 'date' | 'endDate'>): string {
  return holiday.startDate || holiday.date || holiday.endDate || '';
}

export function holidayEnd(holiday: Pick<Holiday, 'startDate' | 'date' | 'endDate'>): string {
  const start = holidayStart(holiday);
  return holiday.endDate || holiday.date || start;
}

export function holidayOccursOn(
  holiday: Pick<Holiday, 'startDate' | 'endDate' | 'date' | 'recurring'>,
  dateYmd: string,
): boolean {
  if (!dateYmd || !YMD.test(dateYmd)) return false;
  const start = holidayStart(holiday);
  const end = holidayEnd(holiday);
  if (!start || !YMD.test(start)) return false;
  const last = YMD.test(end) && end >= start ? end : start;

  if (!holiday.recurring) {
    return dateYmd >= start && dateYmd <= last;
  }

  const span = inclusiveDayCount(start, last);
  const md = holidayMonthDay(start);
  if (!/^\d{2}-\d{2}$/.test(md)) return false;
  const year = Number(dateYmd.slice(0, 4));
  const thisStart = `${year}-${md}`;
  const thisEnd = addDaysYmd(thisStart, span - 1);
  const prevStart = `${year - 1}-${md}`;
  const prevEnd = addDaysYmd(prevStart, span - 1);
  return (
    (dateYmd >= thisStart && dateYmd <= thisEnd) ||
    (dateYmd >= prevStart && dateYmd <= prevEnd)
  );
}

export function findHolidayOnDate(
  dateYmd: string,
  holidays: Holiday[],
): Holiday | undefined {
  return holidays.find((h) => holidayOccursOn(h, dateYmd));
}

export function isHolidayDate(dateYmd: string, holidays: Holiday[]): boolean {
  return Boolean(findHolidayOnDate(dateYmd, holidays));
}

/** Expand holidays to concrete YYYY-MM-DD keys overlapping [fromYmd, toYmd]. */
export function holidayDateSet(
  holidays: Holiday[],
  fromYmd: string,
  toYmd: string,
): Set<string> {
  const out = new Set<string>();
  if (!fromYmd || !toYmd) return out;
  const cursor = parseYmd(fromYmd);
  const last = parseYmd(toYmd);
  if (!cursor || !last) return out;
  while (cursor <= last) {
    const key = toYmd(cursor);
    if (holidays.some((h) => holidayOccursOn(h, key))) out.add(key);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export type UpcomingHoliday = {
  holiday: Holiday;
  nextDate: string;
  nextEndDate: string;
};

export function upcomingHolidays(
  holidays: Holiday[],
  fromYmd: string,
  limit = 6,
): UpcomingHoliday[] {
  const rows: UpcomingHoliday[] = [];
  const year = Number(fromYmd.slice(0, 4));

  holidays.forEach((h) => {
    const start = holidayStart(h);
    const end = holidayEnd(h);
    if (!start || !YMD.test(start)) return;
    const last = YMD.test(end) && end >= start ? end : start;
    const span = inclusiveDayCount(start, last);

    if (!h.recurring) {
      if (last < fromYmd) return;
      const nextDate = start >= fromYmd ? start : fromYmd;
      rows.push({ holiday: h, nextDate, nextEndDate: last });
      return;
    }

    const md = holidayMonthDay(start);
    if (!/^\d{2}-\d{2}$/.test(md)) return;
    let occStart = `${year}-${md}`;
    let occEnd = addDaysYmd(occStart, span - 1);
    if (occEnd < fromYmd) {
      occStart = `${year + 1}-${md}`;
      occEnd = addDaysYmd(occStart, span - 1);
    }
    const nextDate = occStart >= fromYmd ? occStart : fromYmd;
    rows.push({ holiday: h, nextDate, nextEndDate: occEnd });
  });

  rows.sort(
    (a, b) =>
      a.nextDate.localeCompare(b.nextDate) || a.holiday.name.localeCompare(b.holiday.name),
  );
  return rows.slice(0, limit);
}

export async function fetchHolidays(tenantId: string): Promise<Holiday[]> {
  const snap = await getDocs(query(collection(db, 'holidays'), where('tenantId', '==', tenantId)));
  return snap.docs
    .map((d) => ({ ...(d.data() as Holiday), id: d.id }))
    .sort(
      (a, b) =>
        holidayStart(a).localeCompare(holidayStart(b)) || a.name.localeCompare(b.name),
    );
}
