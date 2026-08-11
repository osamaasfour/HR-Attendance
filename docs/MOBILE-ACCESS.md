# Mobile access (anywhere)

## Permanent (recommended): Firebase Hosting

Public URLs after deploy:
- https://ecf-hr.web.app
- https://ecf-hr.firebaseapp.com

### One-time login + deploy

In a normal PowerShell/terminal (interactive):

```bash
cd e:\HR\hr-attendance-app
npx firebase-tools login
npm run deploy:web
```

`deploy:web` runs `expo export --platform web` then deploys `dist/` to Hosting.

### Re-deploy after code changes

```bash
npm run deploy:web
```

### Auth note

Email/password login works on `*.web.app` / `*.firebaseapp.com` by default.
If you add a custom domain, add it under Firebase Console → Authentication → Settings → Authorized domains.

---

## Temporary testing (same Wi‑Fi)

```bash
npx serve dist -l 4173
```

Open `http://YOUR_PC_LAN_IP:4173` on the phone (same network).

---

## Native Expo Go (dev)

```bash
npx expo start --tunnel
```

Install **Expo Go** on the phone and scan the QR code.
