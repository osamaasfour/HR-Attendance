/**
 * Thin ZKTeco TCP client wrapper (port 4370).
 * Uses zk-attendance-sdk for ZK / ZK-compatible devices.
 */

'use strict';

const ZKLib = require('zk-attendance-sdk');
const ZKAttendanceClient = ZKLib.default || ZKLib;

/** Turn SDK/plain-object failures into a readable string */
function formatError(e) {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e instanceof Error) {
    const parts = [e.message, e.code, e.errno].filter(Boolean);
    return parts.join(' ') || e.stack || 'Error';
  }
  if (typeof e === 'object') {
    if (typeof e.message === 'string' && e.message) return e.message;
    if (typeof e.err === 'string' && e.err) return e.err;
    if (typeof e.error === 'string' && e.error) return e.error;
    if (e.code != null) return `code=${e.code}${e.errno != null ? ` errno=${e.errno}` : ''}`;
    try {
      const json = JSON.stringify(e);
      if (json && json !== '{}') return json.slice(0, 480);
    } catch {
      /* ignore */
    }
  }
  return String(e);
}

function asError(e, prefix) {
  const msg = formatError(e);
  const err = new Error(prefix ? `${prefix}: ${msg}` : msg);
  err.cause = e;
  return err;
}

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
 * Does NOT clear the device log — call clearAttendanceLogOnDevice separately if needed.
 * @param {{ host: string, port?: number, timeoutMs?: number }} opts
 * @returns {Promise<Array<{ pin: string, punchTime: Date, externalPunchId: string, rawLine: string }>>}
 */
async function fetchAttendanceLogs({ host, port = 4370, timeoutMs = 10000 }) {
  if (!host) throw new Error('host is required');

  const client = new ZKAttendanceClient(host, Number(port) || 4370, timeoutMs, 5200);
  try {
    try {
      await client.createSocket();
    } catch (e) {
      throw asError(
        e,
        `Cannot connect to ${host}:${port} (check port forward / firewall / device online)`,
      );
    }
    let result;
    try {
      result = await client.getAttendances();
    } catch (e) {
      throw asError(e, `Connected but failed to read attendance from ${host}:${port}`);
    }
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

/**
 * Clear attendance log on the physical device (optional — off by default in Admin).
 */
async function clearAttendanceLogOnDevice({ host, port = 4370, timeoutMs = 10000 }) {
  if (!host) throw new Error('host is required');
  const client = new ZKAttendanceClient(host, Number(port) || 4370, timeoutMs, 5200);
  try {
    await client.createSocket();
    if (typeof client.clearAttendanceLog !== 'function') {
      throw new Error('clearAttendanceLog not supported by SDK');
    }
    await client.clearAttendanceLog();
    console.log(`[zk-ip] cleared attendance log on ${host}:${port}`);
  } finally {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  fetchAttendanceLogs,
  clearAttendanceLogOnDevice,
  normalizeAttendanceLog,
  formatError,
};
