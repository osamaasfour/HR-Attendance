# ZKTeco ADMS + IP poller — VPS Service

Receives fingerprint punch data from ZKTeco terminals via:

1. **ADMS cloud push** — device POSTs to `https://hr.ecfshipment.com`
2. **IP / port 4370 pull** — this service connects out to `host:4370` on a schedule

Both paths write attendance to Firestore via the Firebase Admin SDK.

**Does not require Firebase Blaze plan** — Admin SDK talks to Firestore directly.

---

## Prerequisites

- Docker + Docker Compose on your VPS
- Public HTTPS domain pointing to the VPS (e.g. `hr.ecfshipment.com`) for ADMS
- Nginx (or DataBaseMart Free SSL gateway) proxying to `http://127.0.0.1:3001`
- Firebase service account JSON key with Firestore read/write access
- For **IP devices**: VPS must be able to reach `public_ip:4370` (router port forward / firewall)

---

## Connection modes

| Mode | Admin setting | Device config | Sync |
|------|---------------|---------------|------|
| **ADMS** | Connection type = ADMS | Cloud URL = `https://hr.ecfshipment.com` + SN + key | Push (instant) |
| **IP** | Connection type = IP, Host + Port (4370) | No cloud URL required | Poll every 60s (default) |

Employee PIN on the machine = **Employee ID** (`00001`, `00002`, …).

IP mode supports **ZKTeco / ZK-compatible** TCP protocol only (not unrelated brands).

**Machine log:** By default the poller **downloads without clearing** the device attendance log (`clearDeviceLogAfterSync` is off). Enable that flag per device in Admin only if the terminal memory fills up.

---

## One-time Firebase setup

1. Open [Firebase Console → Project Settings → Service Accounts](https://console.firebase.google.com/project/ecf-hr/settings/serviceaccounts/adminsdk).
2. Click **Generate new private key** and save the downloaded JSON.
3. Upload it to your VPS as `vps/zkteco-adms/secrets/firebase-sa.json`.
4. The `secrets/` folder is git-ignored — never commit this file.

Required IAM role: **Cloud Datastore User** (or Editor for simplicity).

---

## Deploy

```bash
# On your VPS
cd ~/hr-attendance-app/vps/zkteco-adms   # adjust path

# 1. Create .env from the example
cp .env.example .env

# 2. Place service account key
mkdir -p secrets
# chmod so the container non-root user can read it:
chmod 644 secrets/firebase-sa.json

# 3. Build and start
docker compose up -d --build

# 4. Check logs (ADMS + [ip-poll] lines)
docker compose logs -f zkteco-adms

# 5. Health check
curl http://localhost:3001/health
# or: curl https://hr.ecfshipment.com/health
```

### Env (IP poller + timezone)

```
IP_POLL_INTERVAL_MS=60000
IP_POLL_TIMEOUT_MS=10000
PUNCH_TIMEZONE=Africa/Cairo
```

Fingerprint terminals store **local wall-clock** time (no timezone). Each device's
assigned **work location** has its own timezone in Admin → Work Locations. The VPS
resolves punch times using this chain:

1. `workLocations/{id}.timezone` (device's assigned site)
2. `tenants/{tenantId}.timezone` (company default)
3. `PUNCH_TIMEZONE` env (fallback only)
4. `Africa/Cairo`

Set timezone on each work location **before** rebuilding the VPS. `PUNCH_TIMEZONE`
in `.env` is only used when a location has no timezone set.
---

## Updates (after code changes)

```bash
# Copy new vps/zkteco-adms sources onto the server, then:
cd ~/hr-attendance-app/vps/zkteco-adms
docker compose up -d --build
```

Also redeploy the web app so Admin → Devices shows ADMS vs IP:

```bash
# on your PC / CI
npm run deploy:web
```

Deploy updated `firestore.rules` (connectionType on create) if not already live.

---

## ZKTeco ADMS terminal settings

| Setting | Value |
|---------|-------|
| Cloud / ADMS server | `https://hr.ecfshipment.com` |
| Serial number (SN) | Device label (Admin → Fingerprint Devices) |
| Communication key | From Admin setup card |
| Push mode | ADMS enabled |

---

## IP:4370 terminal settings

| Setting | Value |
|---------|-------|
| Admin connection type | IP (port 4370) |
| Host | Public IP (or hostname) reachable from the VPS |
| Port | `4370` (default) |
| Device Comm Key | Same numeric key as on the machine (or `0` if disabled) |
| Router | Forward **TCP and UDP** WAN:4370 → device LAN:4370; allow VPS egress |

**`CMD_ACK_UNAUTH`:** the device has a Comm Key set. Enter that number in Admin → Devices → Device Comm Key, then save.

After save, wait ~1 minute (or watch logs). **Last poll** should update; errors show under the device card.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth) |
| GET | `/iclock/getrequest?SN=…&key=…` | ZKTeco ADMS heartbeat |
| POST | `/iclock/cdata?SN=…&table=ATTLOG&key=…` | ADMS attendance upload |

IP devices do not call these URLs — the poller connects outbound instead.

---

## Logs

```bash
docker compose logs -f zkteco-adms
```

Examples:
```
[punch] SN=ABC123 PIN=00001 → clock-in
[ip-poll] ABC123 @ 1.2.3.4:4370 — 12 logs, 2 new, 2 processed
```

Firestore `fingerprintPunchLog` stores every raw line with `processed`, `ignored`, or `failed`.

---

## Testing

### ADMS

```bash
curl https://hr.ecfshipment.com/health
curl "https://hr.ecfshipment.com/iclock/getrequest?SN=YOUR_SN&key=YOUR_SECRET"
curl -X POST \
  "https://hr.ecfshipment.com/iclock/cdata?SN=YOUR_SN&table=ATTLOG&key=YOUR_SECRET" \
  -H "Content-Type: text/plain" \
  --data-binary $'00001\t2026-08-11 09:00:00\t0\t1\t0\t0\t0\t0\t0\t0'
```

### IP

1. Add device in Admin with connection type **IP**, host, port `4370`.
2. `docker compose logs -f` → look for `[ip-poll]`.
3. Punch on the terminal → attendance with `clockInSource: 'fingerprint'`.
4. Second punch same day → clock-out.
5. Re-poll must not duplicate (cursor `ipSyncAfter` + punch dedupe).
