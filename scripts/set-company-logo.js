/**
 * Set company logoUrl using current Firebase CLI access token + Firestore REST.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const LOGO_URL = 'https://ecf-hr.web.app/branding/ECF-Logo.jpg?v=2';
const PROJECT = 'ecf-hr';

async function main() {
  const cfg = JSON.parse(
    fs.readFileSync(path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'),
  );
  const token = cfg.tokens?.access_token;
  if (!token) throw new Error('Run: npx firebase login');
  if (cfg.tokens.expires_at && cfg.tokens.expires_at < Date.now()) {
    throw new Error('Firebase CLI token expired. Run: npx firebase login');
  }

  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:commit`;
  const writes = [
    {
      update: {
        name: `projects/${PROJECT}/databases/(default)/documents/tenants/default`,
        fields: { logoUrl: { stringValue: LOGO_URL } },
      },
      updateMask: { fieldPaths: ['logoUrl'] },
    },
    {
      update: {
        name: `projects/${PROJECT}/databases/(default)/documents/companySettings/main`,
        fields: { logoUrl: { stringValue: LOGO_URL } },
      },
      updateMask: { fieldPaths: ['logoUrl'] },
    },
  ];

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(text);
    process.exit(1);
  }
  console.log('OK — logoUrl set to', LOGO_URL);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
