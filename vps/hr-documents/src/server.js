/**
 * HR employee documents API — Express + Firebase Auth + local disk.
 *
 * Routes (behind nginx at https://hr.ecfshipment.com):
 *   GET  /health
 *   POST /api/documents/upload          (Bearer Firebase ID token, multipart)
 *   GET  /api/documents/file/:token/:name
 *   DELETE /api/documents/file/:token/:name  (Bearer Firebase ID token)
 *
 * Files are stored as DOCUMENTS_DIR/{token}/{safeName}
 * Public URLs use an unguessable token so Linking.openURL works without auth headers.
 */

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const PORT = Number(process.env.PORT || 3002);
const DOCUMENTS_DIR = process.env.DOCUMENTS_DIR || path.join(__dirname, '..', 'data');
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || 'https://hr.ecfshipment.com').replace(
  /\/$/,
  '',
);
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 50 * 1024 * 1024);
const CORS_ORIGINS = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

// ─── Firebase ────────────────────────────────────────────────────
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

fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });

// ─── Express ─────────────────────────────────────────────────────
const app = express();

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (CORS_ORIGINS.length === 0 || CORS_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  }),
);

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'hr-documents',
    ts: new Date().toISOString(),
  });
});

function safeFileName(name) {
  const base = String(name || 'document')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return base || 'document';
}

/** Prefer UTF-8 text field; fix Latin-1 mojibake from multipart headers. */
function resolveDisplayName(req, file) {
  const fromBody = String(req.body?.fileName || req.body?.filename || '').trim();
  let name = fromBody || String(file?.originalname || '').trim() || 'document';
  // UTF-8 misread as Latin-1 → Arabic looks like Ø²ÙØ±Ø©…
  if (/[ÃØÙðñ]/.test(name) && !/[\u0600-\u06FF]/.test(name)) {
    try {
      const fixed = Buffer.from(name, 'latin1').toString('utf8');
      if (fixed && !fixed.includes('\uFFFD')) name = fixed;
    } catch {
      /* ignore */
    }
  }
  try {
    // Some clients send RFC5987-style percent encoding
    if (/%[0-9A-Fa-f]{2}/.test(name)) {
      const decoded = decodeURIComponent(name);
      if (decoded) name = decoded;
    }
  } catch {
    /* ignore */
  }
  return name.slice(0, 200) || 'document';
}

function guessExt(mime, name) {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return '.pdf';
  if (lower.endsWith('.png')) return '.png';
  if (lower.endsWith('.webp')) return '.webp';
  if (lower.endsWith('.gif')) return '.gif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return '.jpg';
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  return '.bin';
}

async function requireAdmin(req, res, next) {
  try {
    const header = String(req.headers.authorization || '');
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' });
      return;
    }
    const decoded = await admin.auth().verifyIdToken(match[1]);
    const snap = await db.collection('users').doc(decoded.uid).get();
    if (!snap.exists) {
      res.status(403).json({ error: 'User profile not found' });
      return;
    }
    const profile = snap.data() || {};
    const isAdmin = profile.role === 'admin' || profile.platformAdmin === true;
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin role required' });
      return;
    }
    req.authUid = decoded.uid;
    req.authProfile = profile;
    next();
  } catch (e) {
    res.status(401).json({ error: e?.message || 'Invalid token' });
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    const mime = String(file.mimetype || '').toLowerCase();
    if (ALLOWED_MIME.has(mime)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only PDF or image files are allowed'));
  },
});

app.post('/api/documents/upload', requireAdmin, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg = err?.message || 'Upload failed';
      const status = /file too large|File too large/i.test(msg) ? 413 : 400;
      res.status(status).json({ error: msg });
      return;
    }
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'file is required (multipart field name: file)' });
        return;
      }

      const employeeUserId = String(req.body?.employeeUserId || '').trim();
      if (!employeeUserId) {
        res.status(400).json({ error: 'employeeUserId is required' });
        return;
      }

      const employeeSnap = await db.collection('users').doc(employeeUserId).get();
      if (!employeeSnap.exists) {
        res.status(404).json({ error: 'Employee not found' });
        return;
      }
      const employee = employeeSnap.data() || {};
      const adminTenant = String(req.authProfile.tenantId || 'default');
      const empTenant = String(employee.tenantId || 'default');
      if (!req.authProfile.platformAdmin && adminTenant !== empTenant) {
        res.status(403).json({ error: 'Employee is in another tenant' });
        return;
      }

      const token = crypto.randomBytes(24).toString('hex');
      const displayName = resolveDisplayName(req, file);
      const originalName = safeFileName(displayName);
      const ext = path.extname(originalName) || guessExt(file.mimetype, displayName);
      const storedName = `${Date.now()}_${originalName.replace(/\.[^.]+$/, '')}${ext}`.replace(
        /[^\w.\-]+/g,
        '_',
      );

      const dir = path.join(DOCUMENTS_DIR, token);
      fs.mkdirSync(dir, { recursive: true });
      const absPath = path.join(dir, storedName);
      fs.writeFileSync(absPath, file.buffer);

      const url = `${PUBLIC_BASE_URL}/api/documents/file/${token}/${encodeURIComponent(storedName)}`;
      const relativePath = `vps/${token}/${storedName}`;

      res.json({
        ok: true,
        id: `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        name: displayName,
        url,
        path: relativePath,
        mimeType: file.mimetype,
        size: file.size,
        token,
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.authUid,
        employeeUserId,
      });
    } catch (e) {
      console.error('[upload]', e);
      res.status(500).json({ error: e?.message || 'Upload failed' });
    }
  });
});

function resolveFilePath(token, name) {
  const safeToken = String(token || '').replace(/[^a-f0-9]/gi, '');
  const safeName = path.basename(String(name || ''));
  if (!safeToken || safeToken.length < 16 || !safeName) return null;
  const abs = path.join(DOCUMENTS_DIR, safeToken, safeName);
  if (!abs.startsWith(path.join(DOCUMENTS_DIR, safeToken))) return null;
  if (!fs.existsSync(abs)) return null;
  return abs;
}

app.get('/api/documents/file/:token/:name', (req, res) => {
  const abs = resolveFilePath(req.params.token, decodeURIComponent(req.params.name));
  if (!abs) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.sendFile(abs);
});

app.delete('/api/documents/file/:token/:name', requireAdmin, (req, res) => {
  const abs = resolveFilePath(req.params.token, decodeURIComponent(req.params.name));
  if (!abs) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  try {
    fs.unlinkSync(abs);
    const dir = path.dirname(abs);
    try {
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {
      /* ignore */
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Delete failed' });
  }
});

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err?.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`[hr-documents] Listening on port ${PORT}`);
  console.log(`[hr-documents] Files dir: ${DOCUMENTS_DIR}`);
  console.log(`[hr-documents] Public base: ${PUBLIC_BASE_URL}`);
  console.log(`[hr-documents] Firebase project: ${process.env.FIREBASE_PROJECT_ID || 'ecf-hr'}`);
});
