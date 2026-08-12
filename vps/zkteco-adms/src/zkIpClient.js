/**
 * ZKTeco IP:4370 client with Comm Key (CMD_AUTH) support.
 * Uses @graphland/zkteco (handles CMD_ACK_UNAUTH → CMD_AUTH).
 *
 * Note: getAttendances() always downloads the FULL device log. Over the public
 * internet that often times out if the machine holds thousands of old punches.
 * Prefer clearing old logs (or clearDeviceLogNextPoll) once, then keep logs small.
 */

'use strict';

const { coerceDevicePunchTime, getPunchTimezone } = require('./punchTime');

let ZKTecoClientPromise = null;

function loadZKTecoClient() {
  if (!ZKTecoClientPromise) {
    ZKTecoClientPromise = import('@graphland/zkteco').then((mod) => {
      return mod.ZKTecoClient || mod.default;
    });
  }
  return ZKTecoClientPromise;
}

function parseCommKey(secret) {
  if (secret == null || secret === '') return 0;
  const s = String(secret).trim();
  if (!/^\d+$/.test(s)) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

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
    if (e.command) {
      return `${e.command}${e.ip ? ` @ ${e.ip}` : ''}: ${formatError(e.err || e.cause)}`;
    }
    try {
      const json = JSON.stringify(e);
      if (json && json !== '{}' && json !== 'true') return json.slice(0, 480);
    } catch {
      /* ignore */
    }
  }
  if (e === true) return 'UDP connect failed';
  return String(e);
}

function asError(e, prefix) {
  const msg = formatError(e);
  const err = new Error(prefix ? `${prefix}: ${msg}` : msg);
  err.cause = e;
  return err;
}

function isUnauthError(msg) {
  return /UNAUTH|CMD_ACK_UNAUTH|not authorized|auth required/i.test(String(msg || ''));
}

function isTimeoutError(msg) {
  return /TIME\s*OUT|timeout|ETIMEDOUT|PACKETS REMAIN/i.test(String(msg || ''));
}

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

  const rawTime =
    entry.recordTime ?? entry.timestamp ?? entry.attTime ?? entry.time ?? null;
  const punchTime = coerceDevicePunchTime(rawTime);

  if (!pin || !punchTime) return null;

  // Stable id from device wall clock in company timezone
  const timeStr = punchTime.toLocaleString('sv-SE', { timeZone: getPunchTimezone() });
  const status = entry.punch ?? entry.status ?? entry.type ?? entry.state ?? '0';
  const externalPunchId = `${pin}:${timeStr}:${status}`;
  const rawLine = JSON.stringify({
    pin,
    time: timeStr,
    status,
    source: 'ip4370',
  });

  return { pin, punchTime, externalPunchId, rawLine };
}

async function createClient({ host, port, timeoutMs, key }) {
  const ZKTecoClient = await loadZKTecoClient();
  return new ZKTecoClient({
    ip: host,
    port: Number(port) || 4370,
    timeout: Number(timeoutMs) || 300000,
    udpPort: 20000 + Math.floor(Math.random() * 20000),
    commKey: key,
  });
}

async function downloadOnce(client, host, port) {
  if (typeof client.freeData === 'function') {
    try {
      await client.freeData();
    } catch {
      /* ignore */
    }
  }

  if (typeof client.getInfo === 'function') {
    try {
      const info = await client.getInfo();
      console.log(
        `[zk-ip] device info ${host}:${port} users=${info?.userCounts} logs=${info?.logCounts} cap=${info?.logCapacity}`,
      );
    } catch (e) {
      console.warn(`[zk-ip] getInfo warning: ${formatError(e)}`);
    }
  }

  const rows = await client.getAttendances((received, total) => {
    if (total && (received === total || received % 100 === 0)) {
      console.log(`[zk-ip] download ${host}:${port} ${received}/${total}`);
    }
  });
  return Array.isArray(rows) ? rows : [];
}

/**
 * Fetch attendance logs. Does NOT clear the device log.
 */
async function fetchAttendanceLogs({
  host,
  port = 4370,
  timeoutMs = 300000,
  password,
  commKey,
}) {
  if (!host) throw new Error('host is required');

  const key = parseCommKey(commKey != null ? commKey : password);
  let lastErr;

  // Fresh connection for each attempt (WAN transfers often fail mid-stream)
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const client = await createClient({ host, port, timeoutMs, key });
    try {
      await client.connect();
      console.log(
        `[zk-ip] connected ${host}:${port} attempt=${attempt} (commKey ${key === 0 ? 'off' : 'set'})`,
      );
      const rows = await downloadOnce(client, host, port);
      console.log(`[zk-ip] fetched ${rows.length} log(s) from ${host}:${port}`);
      return rows.map(normalizeAttendanceLog).filter(Boolean);
    } catch (e) {
      lastErr = e;
      const msg = formatError(e);
      console.warn(`[zk-ip] attempt ${attempt} failed: ${msg}`);
      if (isUnauthError(msg)) break;
      if (!isTimeoutError(msg) && attempt === 1) break;
    } finally {
      try {
        await client.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  const msg = formatError(lastErr);
  if (isUnauthError(msg)) {
    throw asError(
      lastErr,
      `Auth failed for ${host}:${port}. Set Device Comm Key in Admin to match the machine`,
    );
  }
  if (isTimeoutError(msg)) {
    throw asError(
      lastErr,
      `Download timed out from ${host}:${port}. The device log is too large for a stable internet pull. ` +
        'Clear old attendance on the machine (or use Admin → Clear log on next poll), then new punches will sync',
    );
  }
  throw asError(lastErr, `Failed talking to ${host}:${port}`);
}

async function clearAttendanceLogOnDevice({
  host,
  port = 4370,
  timeoutMs = 60000,
  password,
  commKey,
}) {
  if (!host) throw new Error('host is required');
  const key = parseCommKey(commKey != null ? commKey : password);
  const client = await createClient({ host, port, timeoutMs, key });
  try {
    await client.connect();
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
  parseCommKey,
};
