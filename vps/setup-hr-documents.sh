#!/usr/bin/env bash
# Run ON THE VPS after uploading hr-documents.tar.gz
# Usage:
#   bash setup-hr-documents.sh
# or:
#   bash setup-hr-documents.sh /path/to/hr-documents.tar.gz

set -euo pipefail

ARCHIVE="${1:-$HOME/hr-documents.tar.gz}"
TARGET_PARENT="${HOME}/hr-attendance-app/vps"
TARGET="${TARGET_PARENT}/hr-documents"

echo "==> Looking for Firebase service account..."
SA_CANDIDATES=(
  "${HOME}/hr-attendance-app/vps/zkteco-adms/secrets/firebase-sa.json"
  "${HOME}/zkteco-adms/secrets/firebase-sa.json"
  "${HOME}/vps/zkteco-adms/secrets/firebase-sa.json"
  "/opt/zkteco-adms/secrets/firebase-sa.json"
  "/opt/hr-attendance-app/vps/zkteco-adms/secrets/firebase-sa.json"
)

SA_PATH=""
for p in "${SA_CANDIDATES[@]}"; do
  if [[ -f "$p" ]]; then
    SA_PATH="$p"
    break
  fi
done

if [[ -z "$SA_PATH" ]]; then
  echo "Searching filesystem for firebase-sa.json (may take a moment)..."
  SA_PATH="$(find /home /opt /var /root -name 'firebase-sa.json' 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$SA_PATH" ]]; then
  echo "ERROR: firebase-sa.json not found."
  echo "Copy it from your zkteco-adms secrets folder first."
  exit 1
fi
echo "    Found: $SA_PATH"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "ERROR: archive not found: $ARCHIVE"
  echo "From your Windows PC, upload with:"
  echo "  scp e:\\HR\\hr-attendance-app\\vps\\hr-documents.tar.gz administrator@YOUR_VPS_IP:~/"
  exit 1
fi

mkdir -p "$TARGET_PARENT"
echo "==> Extracting to $TARGET"
rm -rf "$TARGET"
tar -xzf "$ARCHIVE" -C "$TARGET_PARENT"

mkdir -p "$TARGET/secrets"
cp "$SA_PATH" "$TARGET/secrets/firebase-sa.json"
cp -n "$TARGET/.env.example" "$TARGET/.env" || true

echo "==> Building and starting hr-documents container..."
cd "$TARGET"
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

echo "==> Waiting for health..."
sleep 2
if curl -fsS "http://127.0.0.1:3002/health"; then
  echo
  echo "OK — hr-documents is running on :3002"
else
  echo
  echo "Container may still be starting. Check:"
  echo "  docker compose -f $TARGET/docker-compose.yml logs -f"
  exit 1
fi

echo
echo "NEXT: add nginx location for /api/documents/ (edit nginx config — do NOT paste into bash)."
echo "Then: sudo nginx -t && sudo systemctl reload nginx"
