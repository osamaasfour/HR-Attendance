/**
 * ZKTeco terminals report wall-clock times (no timezone offset).
 * VPS containers usually run in UTC, so `new Date('2026-08-12T09:15:00')`
 * and ZK libs using `new Date(y, m, d, h, mi, s)` treat device local as UTC.
 * The app then shows punch times shifted by the Egypt offset (+2/+3h).
 *
 * Always interpret naive device timestamps in PUNCH_TIMEZONE (default Africa/Cairo).
 */

const DEFAULT_PUNCH_TIMEZONE = 'Africa/Cairo';

function getPunchTimezone() {
  return process.env.PUNCH_TIMEZONE || DEFAULT_PUNCH_TIMEZONE;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Parse "YYYY-MM-DD HH:mm:ss" / "YYYY-MM-DDTHH:mm:ss" as wall time in `timeZone`.
 * @returns {Date|null}
 */
function parseDeviceWallTime(timeStr, timeZone = getPunchTimezone()) {
  const m = String(timeStr || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    const fallback = new Date(timeStr);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] || '0');

  // Find UTC ms whose zoned wall-clock matches the device components.
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  for (let i = 0; i < 3; i += 1) {
    const parts = {};
    for (const p of fmt.formatToParts(new Date(utcMs))) {
      if (p.type !== 'literal') parts[p.type] = p.value;
    }
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    utcMs += desired - asUtc;
  }

  const result = new Date(utcMs);
  return Number.isNaN(result.getTime()) ? null : result;
}

/**
 * Coerce device punch time values into a correct UTC Date.
 * - string: naive wall time in punch timezone
 * - Date: host-local y/m/d/h/m/s from ZK `new Date(y,m,d,…)` = device wall on UTC hosts
 * - number: unix epoch (already absolute)
 */
function coerceDevicePunchTime(rawTime, timeZone = getPunchTimezone()) {
  if (rawTime == null) return null;

  if (rawTime instanceof Date) {
    if (Number.isNaN(rawTime.getTime())) return null;
    // ZK @graphland/zkteco builds with `new Date(y, month, day, h, mi, s)` (host local).
    // Those local components are the device wall clock — re-parse in company TZ.
    const wall =
      `${rawTime.getFullYear()}-${pad2(rawTime.getMonth() + 1)}-${pad2(rawTime.getDate())}` +
      ` ${pad2(rawTime.getHours())}:${pad2(rawTime.getMinutes())}:${pad2(rawTime.getSeconds())}`;
    return parseDeviceWallTime(wall, timeZone);
  }

  if (typeof rawTime === 'number' && Number.isFinite(rawTime)) {
    const ms = rawTime > 1e12 ? rawTime : rawTime * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof rawTime === 'string' && rawTime.trim()) {
    return parseDeviceWallTime(rawTime, timeZone);
  }

  return null;
}

function zonedParts(date, timeZone = getPunchTimezone()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function toDateStringInZone(date = new Date(), timeZone = getPunchTimezone()) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function minutesOfDayInZone(date, timeZone = getPunchTimezone()) {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

module.exports = {
  DEFAULT_PUNCH_TIMEZONE,
  getPunchTimezone,
  parseDeviceWallTime,
  coerceDevicePunchTime,
  toDateStringInZone,
  minutesOfDayInZone,
  zonedParts,
};
