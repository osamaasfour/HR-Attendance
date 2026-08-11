/**
 * Time & Date Utility Functions
 */

import { WORK_START, WORK_END, LATE_GRACE_MINUTES } from '../constants/theme';
import type { AttendanceStatus } from '../types';

/**
 * Formats a Date or ISO string to a readable time string.
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats a Date or ISO string to a readable date string.
 * @example formatDate(new Date()) => "Mon, Jan 15, 2025"
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats a Date to "YYYY-MM-DD" for Firestore querying.
 * @example toDateString(new Date()) => "2025-01-15"
 */
export function toDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns a friendly date label: "Today", "Yesterday", or the formatted date.
 */
export function getFriendlyDateLabel(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();

  // Check "Today"
  if (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  ) {
    return 'Today';
  }

  // Check "Yesterday"
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) {
    return 'Yesterday';
  }

  return formatDate(d);
}

/**
 * Calculates the duration between two timestamps in hours.
 *
 * @param startTime - Clock-in timestamp (Date, string, or Firebase Timestamp)
 * @param endTime - Clock-out timestamp (Date, string, or Firebase Timestamp)
 * @returns Duration in hours with 2 decimal places
 *
 * @example
 *   calculateDuration('2025-01-15T09:00:00', '2025-01-15T17:30:00') => 8.50
 */
export function calculateDuration(
  startTime: Date | string,
  endTime: Date | string,
): number {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime;
  const diffMs = end.getTime() - start.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return Math.round(diffHours * 100) / 100; // Round to 2 decimals
}

/**
 * Formats a duration in hours to a human-readable string.
 * @example formatDuration(8.5) => "8h 30m"
 */
export function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Determines the attendance status based on hours worked.
 *
 * - >= fullDayHours → "present" (full day)
 * - > 0 hours but < fullDayHours → "half-day"
 * - 0 hours → "absent"
 *
 * @param hoursWorked - Total hours worked in the day
 * @param lateMinutes - Minutes late after grace
 * @param fullDayHours - Hours required for a full day (tenant setting)
 */
export function calculateAttendanceStatus(
  hoursWorked: number,
  lateMinutes = 0,
  fullDayHours = 8,
): AttendanceStatus {
  if (hoursWorked <= 0) return 'absent';
  if (lateMinutes > 0) return 'late';
  if (hoursWorked >= fullDayHours) return 'present';
  return 'half-day';
}

/** True if the date is a company working day (not in weeklyOffDays). */
export function isWorkingDay(
  date: Date,
  weeklyOffDays: number[] = [0, 6],
): boolean {
  return !weeklyOffDays.includes(date.getDay());
}

/** Parse "HH:mm" into minutes from midnight */
export function parseHmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Minutes late vs WORK_START after grace */
export function computeLateMinutes(
  clockIn: Date,
  workStart = WORK_START,
  grace = LATE_GRACE_MINUTES,
): number {
  const start = parseHmToMinutes(workStart);
  const actual = minutesOfDay(clockIn);
  const raw = Math.max(0, actual - start);
  return Math.max(0, raw - grace);
}

/** Minutes early vs WORK_END */
export function computeEarlyLeaveMinutes(clockOut: Date, workEnd = WORK_END): number {
  const end = parseHmToMinutes(workEnd);
  const actual = minutesOfDay(clockOut);
  return Math.max(0, end - actual);
}

/**
 * Returns the current date and time as a formatted string.
 * @example getCurrentDateTime() => "Mon, Jan 15, 2025 • 09:45 AM"
 */
export function getCurrentDateTime(): string {
  return `${formatDate(new Date())} \u2022 ${formatTime(new Date())}`;
}

/**
 * Returns live clock time string — useful for the dashboard display.
 * Updated every second via setInterval in the component.
 */
export function getLiveClockTime(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}
