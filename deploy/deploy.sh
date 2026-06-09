#!/usr/bin/env bash
# Maestro School — production deploy script (runs on VPS)
set -euo pipefail

APP_DIR="/var/www/maestro_school"
cd "$APP_DIR"

DEPLOY_HOST="${DEPLOY_HOST:-178.105.59.89}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-maestro_prod_change_me}"
JWT_SECRET="${JWT_SECRET:-}"
CORS_ORIGIN="${CORS_ORIGIN:-http://${DEPLOY_HOST}:3000}"
API_PUBLIC_URL="${API_PUBLIC_URL:-http://${DEPLOY_HOST}:4000/api/v1}"

log() { echo "[deploy] $*"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing command: $1" >&2
    exit 1
  fi
}

require_cmd node
require_cmd npm
require_cmd docker

if [ -z "$JWT_SECRET" ] || [ "${#JWT_SECRET}" -lt 16 ]; then
  echo "JWT_SECRET must be set (min 16 chars). Add GitHub secret JWT_SECRET." >&2
  exit 1
fi

log "Starting PostgreSQL..."
export POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d

log "Waiting for database..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U maestro -d maestro >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

log "Writing backend .env..."
cat > backend/.env <<EOF
DATABASE_URL="postgresql://maestro:${POSTGRES_PASSWORD}@localhost:5432/maestro?schema=public"
JWT_SECRET="${JWT_SECRET}"
PORT=4000
HOST=0.0.0.0
CORS_ORIGIN="${CORS_ORIGIN}"
UPLOAD_DIR="/var/www/maestro_school/backend/uploads"
EOF

log "Writing web_app .env.local..."
cat > web_app/.env.local <<EOF
NEXT_PUBLIC_API_URL=${API_PUBLIC_URL}
EOF

log "Installing backend dependencies..."
cd backend
npm ci
npm run db:generate
npm run db:migrate

if [ "${RUN_SEED:-false}" = "true" ]; then
  log "Seeding database..."
  npm run db:seed
fi

log "Building backend..."
npm run build
cd "$APP_DIR"

log "Installing frontend dependencies..."
cd web_app
npm ci

log "Building frontend..."
npm run build
cd "$APP_DIR"

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2..."
  npm install -g pm2
fi

log "Restarting PM2 apps..."
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save

log "Deploy complete."
log "Web:    http://${DEPLOY_HOST}:3000"
log "API:    http://${DEPLOY_HOST}:4000/api/v1"
log "Health: http://${DEPLOY_HOST}:4000/health"
