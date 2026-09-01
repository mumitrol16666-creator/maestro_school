#!/bin/sh
set -eu

# Compose Bake occasionally stalls while scanning the large legacy CRM context.
# The classic builder is deterministic for this local QA stack.
export COMPOSE_BAKE=false

LEARNING_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CRM_ROOT=$(CDPATH= cd -- "$LEARNING_ROOT/../maestro-crm" && pwd)
LEARNING_COMPOSE="$LEARNING_ROOT/docker-compose.qa.local.yml"
CRM_COMPOSE="$CRM_ROOT/docker-compose.qa.local.yml"
QA_SECRET="local-maestro-qa-controller-2026"
LEARNING_HOST_DATABASE_URL="postgresql://maestro_qa:maestro_qa_password@127.0.0.1:55435/maestro_regression?schema=public"

wait_for_url() {
  url=$1
  attempts=0
  until curl -fsS "$url" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 90 ]; then
      echo "Timed out waiting for $url" >&2
      exit 1
    fi
    sleep 2
  done
}

controller() {
  method=$1
  path=$2
  body=${3:-}
  if [ -n "$body" ]; then
    curl -fsS -X "$method" \
      -H "X-Maestro-QA-Secret: $QA_SECRET" \
      -H "Content-Type: application/json" \
      --data "$body" \
      "http://127.0.0.1:5002/api/qa/v1$path"
  else
    curl -fsS -X "$method" \
      -H "X-Maestro-QA-Secret: $QA_SECRET" \
      "http://127.0.0.1:5002/api/qa/v1$path"
  fi
}

reuse_image() {
  source_image=$1
  qa_image=$2
  if docker image inspect "$qa_image" >/dev/null 2>&1; then
    return
  fi
  if ! docker image inspect "$source_image" >/dev/null 2>&1; then
    echo "Required local image $source_image is missing. Build the ordinary local stack first or run with QA_REBUILD=YES." >&2
    exit 1
  fi
  docker image tag "$source_image" "$qa_image"
}

prepare_images() {
  if [ "${QA_REBUILD:-}" = "YES" ]; then
    return
  fi
  reuse_image maestro-crm-backend:latest maestro-crm-qa-backend:local
  reuse_image maestro-crm-frontend:latest maestro-crm-qa-frontend:local
  reuse_image maestro-local-backend:latest maestro-learning-qa-backend:local
  reuse_image maestro-local-web:latest maestro-learning-qa-web:local
}

learning_backend_running() {
  docker compose -f "$LEARNING_COMPOSE" ps --status running --services 2>/dev/null \
    | grep -qx backend
}

learning_exec() {
  if learning_backend_running; then
    docker compose -f "$LEARNING_COMPOSE" exec -T backend "$@"
    return
  fi

  echo "Learning QA backend container is not running; using the guarded host backend."
  (
    cd "$LEARNING_ROOT/backend"
    env \
      NODE_ENV=development \
      TZ=Asia/Aqtobe \
      DATABASE_URL="$LEARNING_HOST_DATABASE_URL" \
      JWT_SECRET=local-maestro-learning-qa-jwt-secret \
      CRM_API_URL=http://127.0.0.1:5002 \
      INTEGRATION_SERVICE_SECRET=local-maestro-integration-secret \
      INTEGRATION_SSO_SECRET=local-maestro-qa-sso-secret \
      PRODUCT_V2_CUTOVER_AT=2026-01-01T00:00:00.000Z \
      FEATURE_LEARNING_TOPICS_V2=true \
      FEATURE_STUDENT_WORKSPACE_V2=true \
      FEATURE_HOMEWORK_FLOW_V2=true \
      FEATURE_UNIFIED_LESSON_V2=true \
      FEATURE_LESSON_SYNC_V2=true \
      FEATURE_REWARD_ECONOMY_V2=true \
      FEATURE_CURATOR_WORKSPACE_V2=true \
      FEATURE_LEARNING_DIALOGS_V2=true \
      FEATURE_ROLE_NAVIGATION_V2=true \
      MAESTRO_QA_LOCAL=true \
      MAESTRO_QA_DB_MARKER=maestro-learning-regression \
      "$@"
  )
}

seed() {
  echo "Seeding the isolated CRM database maestro_crm_regression..."
  docker compose -f "$CRM_COMPOSE" exec -T backend npm run db:seed:qa

  echo "Seeding the isolated Learning Platform database maestro_regression..."
  learning_exec npm run db:seed:qa
  learning_exec npm run economy:v2:cutover:apply
}

reset_learning_fixtures() {
  learning_exec npx tsx scripts/qa-reset.ts
}

case "${1:-status}" in
  up)
    prepare_images
    build_flag=""
    if [ "${QA_REBUILD:-}" = "YES" ]; then
      build_flag="--build"
    fi
    echo "Starting isolated CRM QA on http://127.0.0.1:5002..."
    docker compose -f "$CRM_COMPOSE" up -d $build_flag
    wait_for_url "http://127.0.0.1:5002/api/health"

    echo "Starting isolated Learning Platform QA on http://127.0.0.1:3321..."
    docker compose -f "$LEARNING_COMPOSE" up -d $build_flag
    wait_for_url "http://127.0.0.1:4001/health"
    wait_for_url "http://127.0.0.1:3321/login"
    seed
    echo "QA stack is ready: app http://127.0.0.1:3321, CRM http://127.0.0.1:8081"
    ;;
  seed)
    seed
    ;;
  reset)
    controller POST /reset '{}'
    printf '\n'
    reset_learning_fixtures
    seed
    ;;
  status)
    echo "CRM QA controller:"
    controller GET /status
    printf '\nLearning Platform QA health:\n'
    curl -fsS "http://127.0.0.1:4001/health"
    printf '\n'
    ;;
  test)
    controller POST /reset '{}'
    printf '\n'
    reset_learning_fixtures
    seed
    node "$LEARNING_ROOT/scripts/qa-crm-lifecycle-e2e.mjs"
    ;;
  down)
    docker compose -f "$LEARNING_COMPOSE" down
    docker compose -f "$CRM_COMPOSE" down
    ;;
  destroy)
    if [ "${MAESTRO_QA_DESTROY:-}" != "YES" ]; then
      echo "Refusing to delete volumes. Re-run with MAESTRO_QA_DESTROY=YES." >&2
      exit 1
    fi
    docker compose -f "$LEARNING_COMPOSE" down -v --remove-orphans
    docker compose -f "$CRM_COMPOSE" down -v --remove-orphans
    ;;
  *)
    echo "Usage: $0 {up|seed|reset|status|test|down|destroy}" >&2
    exit 2
    ;;
esac
