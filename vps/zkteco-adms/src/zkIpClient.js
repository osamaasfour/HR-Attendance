/**
 * Thin ZKTeco TCP/UDP client wrapper (port 4370).
 * Primary: zk-attendance-sdk (TCP, then UDP on ECONNREFUSED).
 * Fallback: zklib over UDP when TCP CONNECT fails (common behind port-forward).
 */

'use strict';

const ZKLibSdk = require('zk-attendance-sdk');
const ZKAttendanceClient = ZKLibSdk.default || ZKLibSdk;
const ZKLibUdp = require('zklib');

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
    if (e.command) {
      const inner = formatError(e.err || e.cause);
      return `${e.command}${e.ip ? ` @ ${e.ip}` : ''}: ${inner}`;
    }
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
 * Normalize a single attendance log entry into a punch shape.
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
    entry.recordTime ??
    entry.timestamp ??
    entry.attTime ??
    entry.time ??
    entry.timestamp ??
    null;
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

async function fetchViaSdk({ host, port, timeoutMs }) {
  const client = new ZKAttendanceClient(host, Number(port) || 4370, Number(timeoutMs) || 15000);
  try {
    await client.createSocket();
    const connType =
      typeof client.getConnectionType === 'function'
        ? client.getConnectionType()
        : 'unknown';
    console.log(`[zk-ip] SDK connected ${host}:${port} via ${connType}`);

    const result = await client.getAttendances();
    if (result && result.err) {
      throw asError(result.err, `Read attendance returned error from ${host}:${port}`);
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
      /* ignore */
    }
  }
}

function promisifyConnect(zk) {
  return new Promise((resolve, reject) => {
    zk.connect((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function promisifyGetAttendance(zk) {
  return new Promise((resolve, reject) => {
    zk.getAttendance((err, data) => {
      if (err) reject(err);
      else resolve(data || []);
    });
  });
}

async function fetchViaUdpZklib({ host, port, timeoutMs }) {
  const inport = 20000 + Math.floor(Math.random() * 20000);
  const zk = new ZKLibUdp({
    ip: host,
    port: Number(port) || 4370,
    inport,
    timeout: Number(timeoutMs) || 15000,
    attendanceParser: 'v6.60',
    connectionType: 'udp',
  });

  await promisifyConnect(zk);
  console.log(`[zk-ip] zklib UDP connected ${host}:${port} (local ${inport})`);
  try {
    const rows = await promisifyGetAttendance(zk);
    return (Array.isArray(rows) ? rows : []).map(normalizeAttendanceLog).filter(Boolean);
  } finally {
    try {
      zk.disconnect();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Fetch attendance logs from a device over TCP/UDP.
 * Does NOT clear the device log.
 */
async function fetchAttendanceLogs({ host, port = 4370, timeoutMs = 15000 }) {
  if (!host) throw new Error('host is required');

  let sdkErr;
  try {
    return await fetchViaSdk({ host, port, timeoutMs });
  } catch (e) {
    sdkErr = e;
    console.warn(
      `[zk-ip] SDK failed for ${host}:${port} — trying UDP fallback: ${formatError(e)}`,
    );
  }

  try {
    return await fetchViaUdpZklib({ host, port, timeoutMs });
  } catch (udpErr) {
    throw asError(
      udpErr,
      `Cannot connect to ${host}:${port} (SDK: ${formatError(sdkErr)}; UDP: ${formatError(udpErr)}). ` +
        'Forward BOTH TCP and UDP 4370 to the device; ensure no other PC software is connected.',
    );
  }
}

/**
 * Clear attendance log on the physical device (optional — off by default in Admin).
 */
async function clearAttendanceLogOnDevice({ host, port = 4370, timeoutMs = 15000 }) {
  if (!host) throw new Error('host is required');
  const client = new ZKAttendanceClient(host, Number(port) || 4370, Number(timeoutMs) || 15000);
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
