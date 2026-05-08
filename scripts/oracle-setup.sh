#!/usr/bin/env bash
# ==========================================================
# Ryhavean YouTube — Oracle Cloud Free Tier bootstrap script
# Tested on: Ubuntu 22.04 / 24.04 (ARM or AMD)
#
# Usage (on a fresh Oracle VM, logged in as `ubuntu`):
#   git clone https://github.com/RyhaveanProject/ryoutube.git /opt/ryoutube
#   cd /opt/ryoutube
#   cp backend/.env.example backend/.env
#   nano backend/.env                      # <-- fill real values
#   sudo bash scripts/oracle-setup.sh      # installs docker + caddy + launches the backend
# ==========================================================
set -euo pipefail

APP_DIR="/opt/ryoutube"
BACKEND_ENV="${APP_DIR}/backend/.env"
CONTAINER_NAME="ryhavean-yt"
IMAGE_NAME="ryhavean-yt-backend"

if [[ "$EUID" -ne 0 ]]; then
  echo "Please run as root:  sudo bash scripts/oracle-setup.sh"
  exit 1
fi

if [[ ! -f "${BACKEND_ENV}" ]]; then
  echo "ERROR: ${BACKEND_ENV} not found."
  echo "Copy backend/.env.example to backend/.env and fill real values first."
  exit 1
fi

echo "==> Installing Docker (if missing)…"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker ubuntu || true
fi

echo "==> Opening firewall ports 80/443…"
iptables -C INPUT -p tcp --dport 80  -j ACCEPT 2>/dev/null || \
  iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || \
  iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
netfilter-persistent save || true

echo "==> Building backend image…"
cd "${APP_DIR}"
docker build -t "${IMAGE_NAME}" ./backend

echo "==> (Re)starting container…"
docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true
docker run -d --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  --env-file "${BACKEND_ENV}" \
  -p 127.0.0.1:8001:8001 \
  "${IMAGE_NAME}"

echo "==> Waiting for backend to become healthy…"
for i in {1..20}; do
  if curl -fsS http://127.0.0.1:8001/api/ >/dev/null; then
    echo "    backend is up."
    break
  fi
  sleep 2
done

echo
echo "============================================================"
echo "Backend is running on 127.0.0.1:8001"
echo
echo "NEXT STEP: install Caddy for HTTPS. Example:"
echo "  sudo apt install -y caddy"
echo "  sudo nano /etc/caddy/Caddyfile    # see DEPLOYMENT.md"
echo "  sudo systemctl reload caddy"
echo "============================================================"
