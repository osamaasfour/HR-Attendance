/**
 * ZKTeco ADMS receiver — Express server.
 *
 * ZKTeco terminals push attendance via:
 *   POST /iclock/cdata?SN=...&table=ATTLOG&key=...
 *   GET  /iclock/getrequest?SN=...&key=...  (heartbeat)
 *
 * This service writes to Firestore using the Firebase Admin SDK.
 * No Firebase Cloud Functions / Blaze plan required.
 */

'use strict';

require('dotenv').config();

const express = require('express');
const admin = require('firebase-admin');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { processFingerprintPunch } = require('./punchProcessor');
const { startIpPoller } = require('./ipPoller');

// ─── Firebase init ───────────────────────────────────────────────
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error('[startup] GOOGLE_APPLICATION_CREDENTIALS is not set');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(credPath),
  projectId: process.env.FIREBASE_PROJECT_ID || 'ecf-hr',
});

const db = getFirestore();

// ─── Express setup ───────────────────────────────────────────────
const app = express();
const PORT = Number(process.env.PORT || 3001);

// Preserve raw body for tab-delimited ATTLOG lines
app.use(express.raw({ type: '*/*', limit: '2mb' }));

// ─── Helpers ─────────────────────────────────────────────────────
function bodyToString(raw) {
  if (!raw) return '';
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (typeof raw === 'string') return raw;
  return String(raw);
}

const { parseDeviceWallTime } = require('./punchTime');

function parseAttlogLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const parts = trimmed.split(/\t/);
  if (parts.length < 2) return null;
  const pin = parts[0]?.trim();
  const timeStr = parts[1]?.trim();
  if (!pin || !timeStr) return null;
  // Device time is wall-clock (Egypt), not UTC — see punchTime.js
  const punchTime = parseDeviceWallTime(timeStr);
  if (!punchTime) return null;
  const externalPunchId = `${pin}:${timeStr}:${parts[2] || '0'}`;
  return { pin, punchTime, externalPunchId, rawLine: trimmed };
}

async function loadDeviceBySerial(serialNumber) {
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

async function authenticate(req, res) {
  const serialNumber = String(req.query?.SN || req.query?.sn || '').trim();
  if (!serialNumber) {
    res.status(400).send('SN required');
    return null;
  }

  const device = await loadDeviceBySerial(serialNumber);
  if (!device) {
    res.status(403).send('UNKNOWN DEVICE');
    return null;
  }
  if (device.connectionType === 'ip') {
    res.status(403).send('IP DEVICE USE POLLER');
    return null;
  }
  if (device.active === false) {
    res.status(403).send('DEVICE INACTIVE');
    return null;
  }
  if (!verifyDeviceSecret(device, req)) {
    res.status(403).send('INVALID KEY');
    return null;
  }

  await db.collection('fingerprintDevices').doc(device.id).update({
    lastSeenAt: Timestamp.now(),
  });

  return device;
}

// ─── Routes ──────────────────────────────────────────────────────

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'zkteco-adms', ts: new Date().toISOString() });
});

// ZKTeco heartbeat — device polls for commands
app.get('/iclock/getrequest', async (req, res) => {
  try {
    const device = await authenticate(req, res);
    if (!device) return;
    res.status(200).send('OK');
  } catch (e) {
    console.error('[getrequest] error:', e);
    res.status(500).send('ERROR');
  }
});

// ZKTeco attendance log upload
app.post('/iclock/cdata', async (req, res) => {
  try {
    const device = await authenticate(req, res);
    if (!device) return;

    const table = String(req.query?.table || '').toUpperCase();
    if (table && table !== 'ATTLOG') {
      res.status(200).send('OK');
      return;
    }

    const body = bodyToString(req.body);
    const lines = body.split(/\r?\n/).filter(Boolean);
    const results = [];

    for (const line of lines) {
      const parsed = parseAttlogLine(line);
      if (!parsed) continue;
      try {
        const result = await processFingerprintPunch({
          db,
          device,
          rawLine: parsed.rawLine,
          pin: parsed.pin,
          punchTime: parsed.punchTime,
          externalPunchId: parsed.externalPunchId,
        });
        results.push(result);
        console.log(`[punch] SN=${device.serialNumber} PIN=${parsed.pin} → ${result.action || result.reason}`);
      } catch (e) {
        console.error('[punch] processing error:', e);
        await db.collection('fingerprintPunchLog').add({
          deviceSerial: device.serialNumber,
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
  } catch (e) {
    console.error('[cdata] error:', e);
    res.status(500).send('ERROR');
  }
});

// Some ZKTeco models also POST to /cdata without /iclock prefix
app.post('/cdata', async (req, res) => {
  req.url = '/iclock/cdata';
  app.handle(req, res);
});

// ─── Start ───────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[zkteco-adms] Listening on port ${PORT}`);
  console.log(`[zkteco-adms] Firebase project: ${process.env.FIREBASE_PROJECT_ID || 'ecf-hr'}`);
  startIpPoller(db);
});

module.exports = app;
