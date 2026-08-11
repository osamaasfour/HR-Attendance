/**
 * ZKTeco IP:4370 client with Comm Key (CMD_AUTH) support.
 * Uses @graphland/zkteco (handles CMD_ACK_UNAUTH → CMD_AUTH).
 */

'use strict';

let ZKTecoClientPromise = null;

function loadZKTecoClient() {
  if (!ZKTecoClientPromise) {
    ZKTecoClientPromise = import('@graphland/zkteco').then((mod) => {
      return mod.ZKTecoClient || mod.default;
    });
  }
  return ZKTecoClientPromise;
}

/** Device Comm Key is numeric (0 = none). Alphanumeric ADMS secrets → 0. */
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

/**
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

function createClient({ host, port, timeoutMs, key }) {
  return loadZKTecoClient().then((ZKTecoClient) => {
    return new ZKTecoClient({
      ip: host,
      port: Number(port) || 4370,
      timeout: Number(timeoutMs) || 120000,
      udpPort: 20000 + Math.floor(Math.random() * 20000),
      commKey: key,
    });
  });
}

async function downloadAttendances(client, host, port) {
  // Pause terminal UI during bulk download (ZK best practice over slow WAN)
  if (typeof client.disableDevice === 'function') {
    try {
      await client.disableDevice();
    } catch (e) {
      console.warn(`[zk-ip] disableDevice warning: ${formatError(e)}`);
    }
  }

  try {
    const rows = await client.getAttendances((received, total) => {
      if (total && received % 50 === 0) {
        console.log(`[zk-ip] download ${host}:${port} ${received}/${total}`);
      }
    });
    return Array.isArray(rows) ? rows : [];
  } finally {
    if (typeof client.enableDevice === 'function') {
      try {
        await client.enableDevice();
      } catch (e) {
        console.warn(`[zk-ip] enableDevice warning: ${formatError(e)}`);
      }
    }
  }
}

/**
 * Fetch attendance logs. Pass device Comm Key as `commKey` / `password`.
 * Does NOT clear the device log.
 */
async function fetchAttendanceLogs({
  host,
  port = 4370,
  timeoutMs = 120000,
  password,
  commKey,
}) {
  if (!host) throw new Error('host is required');

  const key = parseCommKey(commKey != null ? commKey : password);
  const client = await createClient({ host, port, timeoutMs, key });

  try {
    await client.connect();
    console.log(
      `[zk-ip] connected ${host}:${port} (commKey ${key === 0 ? 'off' : 'set'})`,
    );

    let rows;
    try {
      rows = await downloadAttendances(client, host, port);
    } catch (e) {
      const msg = formatError(e);
      if (isTimeoutError(msg)) {
        console.warn(`[zk-ip] download timeout — retrying once: ${msg}`);
        rows = await downloadAttendances(client, host, port);
      } else {
        throw e;
      }
    }

    console.log(`[zk-ip] fetched ${rows.length} log(s) from ${host}:${port}`);
    return rows.map(normalizeAttendanceLog).filter(Boolean);
  } catch (e) {
    const msg = formatError(e);
    if (isUnauthError(msg)) {
      throw asError(
        e,
        `Auth failed for ${host}:${port}. Set Device Comm Key in Admin to match the machine (Menu → Comm → Security → Comm Key), or set Comm Key to 0 on the device`,
      );
    }
    if (isTimeoutError(msg)) {
      throw asError(
        e,
        `Download timed out from ${host}:${port} (large log over internet). ` +
          'Increase IP_POLL_TIMEOUT_MS, keep Comm Key 0, and consider enabling “Clear machine log after download” once after a successful sync — or clear old logs on the device',
      );
    }
    throw asError(e, `Failed talking to ${host}:${port}`);
  } finally {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

async function clearAttendanceLogOnDevice({
  host,
  port = 4370,
  timeoutMs = 120000,
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
