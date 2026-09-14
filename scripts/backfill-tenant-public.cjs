/**
 * Backfill tenantInvites + emailPublic from existing tenants / payrollSettings.
 * Run: node scripts/backfill-tenant-public.cjs
 *
 * Auth: Firebase CLI login (user OAuth). Uses Firestore REST, not a service account.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'ecf-hr';
const DEFAULT_TENANT_ID = 'default';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const FIREBASE_CLI_OAUTH = {
  client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
};

function normalizeSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function todayYmd(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function toYmd(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : todayYmd(d);
  }
  return null;
}

function licenseState(tenant) {
  if (!tenant || tenant.active === false) return 'suspended';
  const expiresOn = toYmd(tenant.licenseExpiresAt);
  if (!expiresOn) return 'ok';
  return expiresOn < todayYmd() ? 'expired' : 'ok';
}

function emailSettingsDocId(tenantId) {
  const tid = tenantId || DEFAULT_TENANT_ID;
  return tid === DEFAULT_TENANT_ID ? 'smtp' : `smtp_${tid}`;
}

function decodeValue(v) {
  if (!v || typeof v !== 'object') return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return undefined;
}

function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    out[k] = decodeValue(v);
  }
  return out;
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function encodeFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (k === 'updatedAt' && typeof v === 'string' && v.includes('T')) {
      fields[k] = { timestampValue: v };
      continue;
    }
    fields[k] = encodeValue(v);
  }
  return { fields };
}

function loadFirebaseToolsTokens() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Firebase CLI login not found at ${configPath}. Run: npx firebase-tools login`);
  }
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const tokens = cfg.tokens || {};
  if (!tokens.refresh_token) {
    throw new Error('Firebase CLI refresh token missing. Run: npx firebase-tools login');
  }
  return tokens;
}

async function getAccessToken() {
  const tokens = loadFirebaseToolsTokens();
  if (tokens.access_token && Number(tokens.expires_at) - 60_000 > Date.now()) {
    return tokens.access_token;
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: FIREBASE_CLI_OAUTH.client_id,
    client_secret: FIREBASE_CLI_OAUTH.client_secret,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || 'Could not refresh Firebase CLI access token. Run: npx firebase-tools login',
    );
  }
  return json.access_token;
}

async function firestoreFetch(accessToken, pathname, { method = 'GET', body, query = '' } = {}) {
  const url = `${FIRESTORE_BASE}${pathname}${query}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json.error?.message || text.slice(0, 300) || res.statusText;
    throw new Error(`${method} ${pathname}: ${msg}`);
  }
  return json;
}

async function listDocuments(accessToken, collectionId) {
  const docs = [];
  let pageToken = '';
  do {
    const q = `?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const json = await firestoreFetch(accessToken, `/${collectionId}`, { query: q });
    for (const doc of json.documents || []) {
      const id = String(doc.name || '').split('/').pop();
      docs.push({ id, data: decodeFields(doc.fields) });
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function getDocument(accessToken, collectionId, docId) {
  try {
    const json = await firestoreFetch(accessToken, `/${collectionId}/${encodeURIComponent(docId)}`);
    return decodeFields(json.fields);
  } catch (e) {
    if (/NOT_FOUND|not found|404/i.test(String(e.message))) return null;
    throw e;
  }
}

async function upsertDocument(accessToken, collectionId, docId, data) {
  const mask = Object.keys(data)
    .filter((k) => data[k] !== undefined)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  await firestoreFetch(accessToken, `/${collectionId}/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    query: `?${mask}`,
    body: encodeFields(data),
  });
}

async function main() {
  const accessToken = await getAccessToken();
  const tenants = await listDocuments(accessToken, 'tenants');
  console.log(`Tenants: ${tenants.length}`);

  let invites = 0;
  let emails = 0;
  const nowIso = new Date().toISOString();

  for (const row of tenants) {
    const tenantId = row.id;
    const data = row.data;
    const slug = normalizeSlug(data.slug || tenantId) || tenantId;
    await upsertDocument(accessToken, 'tenantInvites', slug, {
      tenantId,
      name: data.name || 'Company',
      slug,
      active: data.active !== false,
      licenseState: licenseState({ ...data, id: tenantId }),
      updatedAt: nowIso,
    });
    invites += 1;

    const smtp = await getDocument(accessToken, 'payrollSettings', emailSettingsDocId(tenantId));
    if (!smtp) continue;
    await upsertDocument(accessToken, 'emailPublic', tenantId, {
      enabled: !!smtp.enabled,
      provider: 'emailjs',
      tenantId,
      publicKey: String(smtp.publicKey || '').trim(),
      serviceId: String(smtp.serviceId || '').trim(),
      templateId: String(smtp.templateId || '').trim(),
      fromEmail: smtp.fromEmail || '',
      ...(smtp.fromName ? { fromName: smtp.fromName } : {}),
      updatedAt: nowIso,
    });
    emails += 1;
  }

  console.log(`Wrote tenantInvites: ${invites}`);
  console.log(`Wrote emailPublic from smtp docs: ${emails}`);
  console.log('DONE');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
