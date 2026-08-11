/**
 * Thin ZKTeco TCP client wrapper (port 4370).
 * Uses zk-attendance-sdk for ZK / ZK-compatible devices.
 */

'use strict';

const ZKLib = require('zk-attendance-sdk');
const ZKAttendanceClient = ZKLib.default || ZKLib;

/**
 * Normalize a single attendance log entry from the SDK into a punch shape.
 * @returns {{ pin: string, punchTime: Date, externalPunchId: string, rawLine: string } | null}
 */
function normalizeAttendanceLog(entry) {
  if (!entry || typeof entry !== 'object') return null;

  const pin = String(
    entry.deviceUserId ??
      entry.userId ??
      entry.uid ??
      entry.user_id ??
      entry.pin ??
      '',
  ).trim();

  let punchTime = null;
  const rawTime =
    entry.recordTime ?? entry.timestamp ?? entry.attTime ?? entry.time ?? null;
  if (rawTime instanceof Date) {
    punchTime = rawTime;
  } else if (typeof rawTime === 'number') {
    punchTime = new Date(rawTime > 1e12 ? rawTime : rawTime * 1000);
  } else if (typeof rawTime === 'string' && rawTime.trim()) {
    punchTime = new Date(rawTime.replace(' ', 'T'));
  }

  if (!pin || !punchTime || Number.isNaN(punchTime.getTime())) return null;

  const timeStr = punchTime.toISOString();
  const status = entry.status ?? entry.type ?? entry.state ?? '0';
  const externalPunchId = `${pin}:${timeStr}:${status}`;
  const rawLine = JSON.stringify({
    pin,
    time: timeStr,
    status,
    source: 'ip4370',
  });

  return { pin, punchTime, externalPunchId, rawLine };
}

/**
 * Fetch attendance logs from a device over TCP.
 * @param {{ host: string, port?: number, timeoutMs?: number }} opts
 * @returns {Promise<Array<{ pin: string, punchTime: Date, externalPunchId: string, rawLine: string }>>}
 */
async function fetchAttendanceLogs({ host, port = 4370, timeoutMs = 10000 }) {
  if (!host) throw new Error('host is required');

  const client = new ZKAttendanceClient(host, Number(port) || 4370, timeoutMs, 5200);
  try {
    await client.createSocket();
    const result = await client.getAttendances();
    const rows = Array.isArray(result)
      ? result
      : Array.isArray(result?.data)
        ? result.data
        : [];
    return rows.map(normalizeAttendanceLog).filter(Boolean);
  } finally {
    try {
      await client.disconnect();
    } catch {
      /* ignore disconnect errors */
    }
  }
}

module.exports = {
  fetchAttendanceLogs,
  normalizeAttendanceLog,
};
