/**
 * ZKTeco ADMS cloud-push HTTP endpoint.
 * Devices POST attendance logs to /iclock/cdata?SN=...&table=ATTLOG
 */

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { processFingerprintPunch } = require('./punchProcessor');
const { parseDeviceWallTime } = require('./punchTime');
const { resolveDeviceTimezone } = require('./deviceTimezone');

function parseAttlogLine(line, timeZone) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const parts = trimmed.split(/\t/);
  if (parts.length < 2) return null;

  const pin = parts[0]?.trim();
  const timeStr = parts[1]?.trim();
  if (!pin || !timeStr) return null;

  const punchTime = parseDeviceWallTime(timeStr, timeZone);
  if (!punchTime) return null;

  const externalPunchId = `${pin}:${timeStr}:${parts[2] || '0'}`;
  return { pin, punchTime, externalPunchId, rawLine: trimmed };
}

async function loadDeviceBySerial(db, serialNumber) {
  const snap = await db
    .collection('fingerprintDevices')
    .where('serialNumber', '==', serialNumber)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

function verifyDeviceSecret(device, req) {
  const key =
    req.query?.key ||
    req.query?.Key ||
    req.query?.password ||
    req.headers?.['x-device-secret'];
  if (!device.deviceSecret) return true;
  if (!key) return false;
  return String(key) === String(device.deviceSecret);
}

async function handleAdmsRequest(req, res) {
  const path = (req.path || req.url || '').toLowerCase();
  const serialNumber = String(req.query?.SN || req.query?.sn || '').trim();

  if (!serialNumber) {
    res.status(400).send('SN required');
    return;
  }

  const db = getFirestore();
  const device = await loadDeviceBySerial(db, serialNumber);

  if (!device) {
    res.status(403).send('UNKNOWN DEVICE');
    return;
  }

  if (device.active === false) {
    res.status(403).send('DEVICE INACTIVE');
    return;
  }

  if (!verifyDeviceSecret(device, req)) {
    res.status(403).send('INVALID KEY');
    return;
  }

  await db.collection('fingerprintDevices').doc(device.id).update({
    lastSeenAt: Timestamp.now(),
  });

  if (path.includes('getrequest')) {
    res.status(200).send('OK');
    return;
  }

  if (path.includes('cdata')) {
    const table = String(req.query?.table || '').toUpperCase();
    if (table && table !== 'ATTLOG') {
      res.status(200).send('OK');
      return;
    }

    let body = '';
    if (req.rawBody) {
      body = req.rawBody.toString('utf8');
    } else if (typeof req.body === 'string') {
      body = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      body = req.body.toString('utf8');
    } else if (req.body && typeof req.body === 'object') {
      body = JSON.stringify(req.body);
    }

    const lines = body.split(/\r?\n/).filter(Boolean);
    const results = [];
    const timeZone = await resolveDeviceTimezone(db, device);

    for (const line of lines) {
      const parsed = parseAttlogLine(line, timeZone);
      if (!parsed) continue;
      try {
        const result = await processFingerprintPunch({
          device,
          rawLine: parsed.rawLine,
          pin: parsed.pin,
          punchTime: parsed.punchTime,
          externalPunchId: parsed.externalPunchId,
        });
        results.push(result);
      } catch (e) {
        console.error('[ZKTeco] punch failed:', e);
        await db.collection('fingerprintPunchLog').add({
          deviceSerial: serialNumber,
          deviceId: device.id,
          tenantId: device.tenantId,
          rawLine: line,
          status: 'failed',
          reason: e?.message || 'Processing error',
          createdAt: Timestamp.now(),
        });
      }
    }

    res.status(200).send(`OK:${results.length}`);
    return;
  }

  res.status(200).send('OK');
}

exports.zktecoAdms = onRequest(
  {
    region: 'us-central1',
    cors: false,
    invoker: 'public',
  },
  handleAdmsRequest,
);
