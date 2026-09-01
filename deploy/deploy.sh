#!/usr/bin/env bash
# Maestro School production deploy entrypoint.
# The unified ecosystem deploy owns source synchronization, backups, migrations,
# release verification and post-deploy smoke checks for both Maestro services.
set -euo pipefail

UNIFIED_DEPLOY="${UNIFIED_DEPLOY:-/var/www/maestro_crm/deploy/deploy-maestro-all.sh}"
RELEASE_SHA="${RELEASE_SHA:-}"

if [ ! -x "$UNIFIED_DEPLOY" ]; then
  echo "Unified Maestro deploy script is unavailable: ${UNIFIED_DEPLOY}" >&2
  echo "Deploy from /var/www/maestro_crm with deploy/deploy-maestro-all.sh." >&2
  exit 1
fi

if [[ ! "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "RELEASE_SHA must contain the exact 40-character commit SHA to deploy." >&2
  exit 1
fi

export LP_RELEASE_SHA_OVERRIDE="$RELEASE_SHA"
exec "$UNIFIED_DEPLOY" learning-platform
