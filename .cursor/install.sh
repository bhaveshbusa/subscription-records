#!/usr/bin/env bash
#
# Cloud Agent install phase for the subscription recorder.
#
# Runs once when a Cursor environment build is created (its result is baked into
# the snapshot) and again for just-in-time sessions that have no build. It must
# be idempotent and must terminate.
#
# Responsibilities: system Postgres, Node dependencies, a development database
# (seeded so the UI is not empty) and a separate migrated-but-unseeded test
# database. Per-boot process startup lives in start.sh, not here.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

log() { printf '[install] %s\n' "$1"; }

# Escalate only when we have to: a build runs as root, an interactive session
# runs as ubuntu with passwordless sudo.
if [ "$(id -u)" -eq 0 ]; then
  as_root() { "$@"; }
elif command -v sudo >/dev/null 2>&1; then
  as_root() { sudo -n "$@"; }
else
  as_root() { "$@"; }
  log "not root and no sudo; system steps may fail"
fi

# 1. Postgres 16 (stable system dependency). Cursor's default image ships Node
#    but no database, so install it here where the build snapshots the result.
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  log "installing postgresql-16"
  as_root apt-get update -qq
  as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    postgresql-16 postgresql-client-16
fi

# 2. Start the cluster so we can create and migrate databases. Containers have
#    no init system, so start it directly.
if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  log "starting postgres"
  as_root pg_ctlcluster 16 main start >/dev/null 2>&1 \
    || as_root service postgresql start >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do
    pg_isready -h localhost -p 5432 >/dev/null 2>&1 && break
    sleep 1
  done
fi
pg_isready -h localhost -p 5432 >/dev/null 2>&1 || {
  log "postgres did not become ready"; exit 1;
}

# 3. TCP password auth for the postgres role, plus the two databases. Idempotent.
psql_super() { as_root -u postgres psql -tAc "$1"; }
if [ "$(id -u)" -eq 0 ]; then
  psql_super() { su postgres -c "psql -tAc \"$1\""; }
fi

psql_super "ALTER USER postgres PASSWORD 'postgres'" >/dev/null
for db in subscription_records subscription_records_test; do
  if ! psql_super "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
    log "creating database ${db}"
    psql_super "CREATE DATABASE ${db}" >/dev/null
  fi
done

# 4. .env.local drives the app, drizzle and vitest (all load it via dotenv).
#    Keys stay empty so the app takes its documented no-key fallbacks: the chat
#    uses the labelled fixture extractor and uploads go to .captures on disk.
if [ ! -f .env.local ]; then
  log "writing .env.local"
  cat > .env.local <<ENV
AUTH_SECRET=$(openssl rand -base64 32)
SEED_EMAIL=seed@example.com
SEED_PASSWORD=subscription-preview
DATABASE_URL=postgres://postgres:postgres@localhost:5432/subscription_records
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/subscription_records_test
ANTHROPIC_API_KEY=
GROQ_API_KEY=
GROQ_TRANSCRIPTION_MODEL=whisper-large-v3-turbo
CAPTURE_STORAGE_BUCKET=
CAPTURE_STORAGE_ENDPOINT=
CAPTURE_STORAGE_REGION=auto
CAPTURE_STORAGE_ACCESS_KEY_ID=
CAPTURE_STORAGE_SECRET_ACCESS_KEY=
ENV
fi

# 5. scripts/test-db.sh (via `pretest`) brings up an ephemeral Docker Postgres
#    unless TEST_DATABASE_URL is already exported. There is no Docker here, so
#    export it for interactive shells; vitest then targets the unseeded test
#    database instead of the seeded development one. This is the script's own
#    first-choice escape hatch.
BASHRC="${HOME}/.bashrc"
EXPORT_LINE='export TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/subscription_records_test"'
if [ -f "$BASHRC" ] && ! grep -qF "$EXPORT_LINE" "$BASHRC"; then
  printf '\n# subscription-records: point `npm test` at the unseeded test database\n%s\n' \
    "$EXPORT_LINE" >> "$BASHRC"
fi

# 6. Dependencies. Skip the reinstall when the cache already carries a matching
#    node_modules.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  log "npm ci"
  npm ci --no-audit --no-fund
fi

# 7. Schema on both databases.
log "migrating development database"
npm run db:migrate --silent
log "migrating test database"
DATABASE_URL="postgres://postgres:postgres@localhost:5432/subscription_records_test" \
  npm run db:migrate --silent

# 8. Seed the development database only, and only when empty, so the UI has data
#    without clobbering work on re-run. The test database is never seeded (its
#    integration suites insert the same fixed ids and would collide).
HAS_ROWS="$(PGPASSWORD=postgres psql -h localhost -U postgres -d subscription_records \
  -tAc "SELECT 1 FROM users LIMIT 1" 2>/dev/null || true)"
if ! printf '%s' "$HAS_ROWS" | grep -q 1; then
  log "seeding development database"
  npm run db:seed
else
  log "development database already has data; not seeding"
fi

log "install complete"
