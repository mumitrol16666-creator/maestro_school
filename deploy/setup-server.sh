#!/usr/bin/env bash
# One-time VPS setup for Maestro School (run as root on 178.105.59.89)
set -euo pipefail

log() { echo "[setup] $*"; }

log "Updating packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y age ca-certificates curl git gnupg postgresql-client rsync

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

npm install -g pm2

mkdir -p /var/www/maestro_school

log "Keeping application ports private behind Nginx..."
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw --force delete allow 3001/tcp >/dev/null 2>&1 || true
  ufw --force delete allow 4000/tcp >/dev/null 2>&1 || true
fi

log "Server ready. Next steps:"
echo "1. Add SSH public key to /root/.ssh/authorized_keys"
echo "2. Add GitHub secrets: SSH_PRIVATE_KEY, JWT_SECRET, POSTGRES_PASSWORD"
echo "3. Push to main — GitHub Actions will deploy automatically"
