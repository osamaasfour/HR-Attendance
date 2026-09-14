# HR Documents — VPS file storage

Stores employee PDF/image documents on your VPS disk.  
The Expo app uploads via HTTPS; Firestore only keeps metadata (`users/{uid}/employeeDocuments`).

**Public URL (same domain as ZKTeco ADMS):** `https://hr.ecfshipment.com`

---

## Prerequisites

- Same VPS / Docker setup as `vps/zkteco-adms`
- Firebase service account JSON (reuse `zkteco-adms/secrets/firebase-sa.json`)
- Nginx (or SSL gateway) on `hr.ecfshipment.com`

---

## Deploy on the VPS

```bash
# On your VPS — copy this folder next to zkteco-adms
cd ~/hr-attendance-app/vps/hr-documents

# Reuse the same Firebase service account
mkdir -p secrets
cp ../zkteco-adms/secrets/firebase-sa.json ./secrets/firebase-sa.json

cp .env.example .env
# edit PUBLIC_BASE_URL / CORS if needed

docker compose up -d --build
docker compose logs -f hr-documents
```

Health check:

```bash
curl -s https://hr.ecfshipment.com/health-documents
# or directly on the host:
curl -s http://127.0.0.1:3002/health
```

---

## Nginx reverse proxy

Add these location blocks to the same `hr.ecfshipment.com` server that already proxies ADMS to `:3001`:

```nginx
# Employee documents API (this service — port 3002)
location /api/documents/ {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 52m;
}

# Optional dedicated health path (maps to /health on :3002)
location = /health-documents {
    proxy_pass http://127.0.0.1:3002/health;
}
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## API

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| `POST` | `/api/documents/upload` | Firebase Bearer (admin) | multipart: `file` + `employeeUserId` |
| `GET` | `/api/documents/file/:token/:name` | none (unguessable token) | open/download |
| `DELETE` | `/api/documents/file/:token/:name` | Firebase Bearer (admin) | remove file |

---

## App config

In the app `.env`:

```
EXPO_PUBLIC_DOCUMENTS_API_URL=https://hr.ecfshipment.com
```

(Defaults to the same host as ZKTeco ADMS if unset.)

---

## Update after code changes

```bash
cd ~/hr-attendance-app/vps/hr-documents
# pull / copy new sources
docker compose up -d --build
```
