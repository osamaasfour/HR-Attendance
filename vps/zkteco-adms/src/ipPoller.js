/**
 * Poll ZKTeco / ZK-compatible devices over IP:4370 and feed punchProcessor.
 */

'use strict';

const { Timestamp } = require('firebase-admin/firestore');
const { fetchAttendanceLogs, clearAttendanceLogOnDevice } = require('./zkIpClient');
const { processFingerprintPunch } = require('./punchProcessor');

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 10_000;

let timer = null;
let running = false;

function formatError(e) {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e instanceof Error) {
    const parts = [e.message, e.code, e.errno].filter(Boolean);
    return parts.join(' ') || 'Error';
  }
  if (typeof e === 'object') {
    if (typeof e.message === 'string' && e.message) return e.message;
    if (typeof e.err === 'string' && e.err) return e.err;
    if (typeof e.error === 'string' && e.error) return e.error;
    try {
      const json = JSON.stringify(e);
      if (json && json !== '{}') return json.slice(0, 480);
    } catch {
      /* ignore */
    }
  }
  return String(e);
}

function syncAfterMs(device) {
  const ts = device.ipSyncAfter;
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

async function loadIpDevices(db) {
  const snap = await db.collection('fingerprintDevices').get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(
      (d) =>
        d.connectionType === 'ip' &&
        d.active !== false &&
        String(d.host || '').trim(),
    );
}

async function pollOneDevice(db, device, timeoutMs) {
  const host = String(device.host).trim();
  const port = Number(device.port) || 4370;
  const afterMs = syncAfterMs(device);

  let logs;
  try {
    logs = await fetchAttendanceLogs({ host, port, timeoutMs });
  } catch (e) {
    const msg = formatError(e).slice(0, 500);
    console.error(`[ip-poll] ${device.serialNumber || device.id} @ ${host}:${port} — ${msg}`);
    await db.collection('fingerprintDevices').doc(device.id).update({
      lastPollAt: Timestamp.now(),
      lastPollError: msg,
    });
    return { ok: false, error: msg };
  }

  const newer = logs
    .filter((l) => l.punchTime.getTime() > afterMs)
    .sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime());

  let maxPunch = afterMs;
  let processed = 0;

  for (const log of newer) {
    try {
      await processFingerprintPunch({
        db,
        device,
        rawLine: log.rawLine,
        pin: log.pin,
        punchTime: log.punchTime,
        externalPunchId: log.externalPunchId,
      });
      processed += 1;
      maxPunch = Math.max(maxPunch, log.punchTime.getTime());
    } catch (e) {
      console.error(
        `[ip-poll] punch error SN=${device.serialNumber} PIN=${log.pin}:`,
        e?.message || e,
      );
      await db.collection('fingerprintPunchLog').add({
        deviceSerial: device.serialNumber,
        deviceId: device.id,
        tenantId: device.tenantId,
        employeePin: log.pin,
        punchTime: Timestamp.fromDate(log.punchTime),
        rawLine: log.rawLine,
        status: 'failed',
        reason: e?.message || 'IP poll processing error',
        createdAt: Timestamp.now(),
      });
    }
  }

  const update = {
    lastPollAt: Timestamp.now(),
    lastPollError: null,
    lastSeenAt: Timestamp.now(),
  };
  if (maxPunch > afterMs) {
    update.ipSyncAfter = Timestamp.fromMillis(maxPunch);
  }

  await db.collection('fingerprintDevices').doc(device.id).update(update);

  if (device.clearDeviceLogAfterSync === true) {
    try {
      await clearAttendanceLogOnDevice({ host, port, timeoutMs });
      // After clearing, reset watermark so we don't skip future punches incorrectly
      // (device starts empty; new punches will be after "now")
      await db.collection('fingerprintDevices').doc(device.id).update({
        ipSyncAfter: Timestamp.now(),
      });
    } catch (e) {
      console.error(
        `[ip-poll] clear log failed SN=${device.serialNumber}:`,
        e?.message || e,
      );
      await db.collection('fingerprintDevices').doc(device.id).update({
        lastPollError: `Synced OK but clear failed: ${formatError(e).slice(0, 400)}`,
      });
    }
  }

  console.log(
    `[ip-poll] ${device.serialNumber || device.id} @ ${host}:${port} — ` +
      `${logs.length} logs, ${newer.length} new, ${processed} processed` +
      (device.clearDeviceLogAfterSync === true ? ' (cleared device log)' : ' (kept device log)'),
  );

  return { ok: true, processed, newer: newer.length, total: logs.length };
}

async function runPollCycle(db) {
  if (running) {
    console.log('[ip-poll] previous cycle still running — skip');
    return;
  }
  running = true;
  try {
    const timeoutMs = Number(process.env.IP_POLL_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    const devices = await loadIpDevices(db);
    if (devices.length === 0) return;

    console.log(`[ip-poll] polling ${devices.length} IP device(s)`);
    for (const device of devices) {
      await pollOneDevice(db, device, timeoutMs);
    }
  } catch (e) {
    console.error('[ip-poll] cycle error:', e);
  } finally {
    running = false;
  }
}

/**
 * Start the background IP poller.
 * @param {import('firebase-admin/firestore').Firestore} db
 */
function startIpPoller(db) {
  const intervalMs = Number(process.env.IP_POLL_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
  if (timer) clearInterval(timer);

  console.log(`[ip-poll] started (interval ${intervalMs}ms)`);

  // First run shortly after boot so lastPollAt updates without waiting a full minute
  setTimeout(() => {
    void runPollCycle(db);
  }, 5_000);

  timer = setInterval(() => {
    void runPollCycle(db);
  }, intervalMs);

  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

module.exports = { startIpPoller, runPollCycle };
