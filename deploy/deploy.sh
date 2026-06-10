#!/usr/bin/env bash
# Maestro School — production deploy script (runs on VPS)
set -euo pipefail

APP_DIR="/var/www/maestro_school"
cd "$APP_DIR"

DEPLOY_HOST="${DEPLOY_HOST:-178.105.59.89}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
JWT_SECRET="${JWT_SECRET:-}"
CORS_ORIGIN="${CORS_ORIGIN:-http://${DEPLOY_HOST}:3000}"
API_PUBLIC_URL="${API_PUBLIC_URL:-http://${DEPLOY_HOST}:4000/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
ADMIN_FIRST_NAME="${ADMIN_FIRST_NAME:-}"
ADMIN_LAST_NAME="${ADMIN_LAST_NAME:-}"

log() { echo "[deploy] $*"; }

docker_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1; then
    return
  fi
  log "Installing Docker..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y curl ca-certificates
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
}

ensure_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    log "Node.js $(node -v), npm $(npm -v)"
    return
  fi
  log "Installing Node.js 20..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  log "Node.js $(node -v), npm $(npm -v)"
}

ensure_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    return
  fi
  log "Installing PM2..."
  npm install -g pm2
}

if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "POSTGRES_PASSWORD must be set." >&2
  exit 1
fi

if [ -z "$JWT_SECRET" ] || [ "${#JWT_SECRET}" -lt 16 ]; then
  echo "JWT_SECRET must be set (min 16 chars). Add GitHub secret JWT_SECRET." >&2
  exit 1
fi

if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ] || [ -z "$ADMIN_FIRST_NAME" ] || [ -z "$ADMIN_LAST_NAME" ]; then
  echo "ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME and ADMIN_LAST_NAME must be set." >&2
  exit 1
fi

ensure_docker
ensure_node
ensure_pm2
install -d -m 0755 /var/lib/maestro/uploads

log "Starting PostgreSQL..."
export POSTGRES_PASSWORD
docker_compose -f docker-compose.prod.yml up -d

log "Waiting for database..."
for i in $(seq 1 30); do
  if docker_compose -f docker-compose.prod.yml exec -T postgres pg_isready -U maestro -d maestro >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if ! docker_compose -f docker-compose.prod.yml exec -T postgres pg_isready -U maestro -d maestro >/dev/null 2>&1; then
  echo "PostgreSQL did not become ready in time." >&2
  exit 1
fi

log "Writing backend .env..."
cat > backend/.env <<EOF
DATABASE_URL="postgresql://maestro:${POSTGRES_PASSWORD}@localhost:5432/maestro?schema=public"
JWT_SECRET="${JWT_SECRET}"
PORT=4000
HOST=0.0.0.0
CORS_ORIGIN="${CORS_ORIGIN}"
UPLOAD_DIR="/var/lib/maestro/uploads"
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

log "Synchronizing roles, permissions and first admin..."
export ADMIN_EMAIL ADMIN_PASSWORD ADMIN_FIRST_NAME ADMIN_LAST_NAME
npm run db:seed

log "Building backend..."
npm run build
cd "$APP_DIR"

log "Installing frontend dependencies..."
cd web_app
npm ci

log "Building frontend..."
npm run build
cd "$APP_DIR"

log "Restarting PM2 apps..."
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save

log "Deploy complete."
log "Web:    http://${DEPLOY_HOST}:3000"
log "API:    http://${DEPLOY_HOST}:4000/api/v1"
log "Health: http://${DEPLOY_HOST}:4000/health"
