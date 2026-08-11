/**
 * Attendance time math (mirrors src/utils/time.ts for Cloud Functions).
 */

const DEFAULT_SCHEDULE = {
  workStart: '09:00',
  workEnd: '17:00',
  fullDayHours: 8,
  lateGraceMinutes: 10,
};

function toDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseHmToMinutes(hm) {
  const [h, m] = String(hm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function computeLateMinutes(clockIn, workStart, grace) {
  const start = parseHmToMinutes(workStart || DEFAULT_SCHEDULE.workStart);
  const actual = minutesOfDay(clockIn);
  const raw = Math.max(0, actual - start);
  return Math.max(0, raw - (grace ?? DEFAULT_SCHEDULE.lateGraceMinutes));
}

function computeEarlyLeaveMinutes(clockOut, workEnd) {
  const end = parseHmToMinutes(workEnd || DEFAULT_SCHEDULE.workEnd);
  const actual = minutesOfDay(clockOut);
  return Math.max(0, end - actual);
}

function calculateDuration(startTime, endTime) {
  const start = startTime instanceof Date ? startTime : new Date(startTime);
  const end = endTime instanceof Date ? endTime : new Date(endTime);
  const diffMs = end.getTime() - start.getTime();
  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
}

function calculateAttendanceStatus(hoursWorked, lateMinutes = 0, fullDayHours = 8) {
  if (hoursWorked <= 0) return 'absent';
  if (lateMinutes > 0) return 'late';
  if (hoursWorked >= fullDayHours) return 'present';
  return 'half-day';
}

/** Parse EMP001, 1, 00001 → canonical 00001 or null */
function normalizeEmployeeId(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const emp = s.match(/^EMP(\d+)$/i);
  let n = null;
  if (emp) {
    n = Number(emp[1]);
  } else if (/^\d{1,5}$/.test(s)) {
    n = Number(s);
  }
  if (n == null || !Number.isFinite(n) || n < 1 || n > 99999) return null;
  return String(n).padStart(5, '0');
}

module.exports = {
  DEFAULT_SCHEDULE,
  toDateString,
  computeLateMinutes,
  computeEarlyLeaveMinutes,
  calculateDuration,
  calculateAttendanceStatus,
  normalizeEmployeeId,
};
