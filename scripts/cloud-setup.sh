#!/usr/bin/env bash
#
# Provision a Claude Code cloud session so `npm test` can run.
#
# Cloud sessions ship PostgreSQL 16 pre-installed but not running, and the
# environment cache keeps files rather than processes, so the database has to be
# started every session. This runs from the SessionStart hook in
# .claude/settings.json.
#
# It is a no-op outside the cloud: CLAUDE_CODE_REMOTE is "true" only on a
# session VM, so a local run never touches your .env.local or your own database.
#
# The credentials written here are throwaway and match .github/workflows/ci.yml.
# Never put real Neon, Anthropic, Groq, or R2 keys in a cloud
# environment: every session in it can read them. The app degrades on purpose
# when those are unset — chat uses the labelled fixture extractor, uploads go to
# .captures on disk, and the jobs stay reachable only by hand.

set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

log() { printf '[cloud-setup] %s\n' "$1"; }

# The SessionStart hook runs as whatever user Claude Code runs as, which is not
# guaranteed to be root the way a setup script is. Escalate only when we have to.
if [ "$(id -u)" -eq 0 ]; then
  as_root() { "$@"; }
elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  as_root() { sudo -n "$@"; }
else
  as_root() { "$@"; }
  log "not root and no passwordless sudo; postgres commands may fail"
fi

# Run one SQL statement as the postgres superuser, whichever way is available.
if [ "$(id -u)" -eq 0 ]; then
  psql_super() { su postgres -c "psql -tAc \"$1\""; }
elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  psql_super() { sudo -n -u postgres psql -tAc "$1"; }
else
  psql_super() { psql -tAc "$1"; }
fi

DB_NAME=subscription_records
DB_URL="postgres://postgres:postgres@localhost:5432/${DB_NAME}"

# 1. Postgres: start it, then make TCP password auth work for the postgres role.
log "starting postgres"
as_root service postgresql start >/dev/null 2>&1 || as_root pg_ctlcluster 16 main start >/dev/null 2>&1 || true

for _ in $(seq 1 30); do
  pg_isready -h localhost -p 5432 >/dev/null 2>&1 && break
  sleep 1
done

if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  log "postgres did not become ready; integration tests will fail"
  exit 0
fi

psql_super "ALTER USER postgres PASSWORD 'postgres'" >/dev/null || \
  log "could not set the postgres password; integration tests may fail to connect"

if ! psql_super "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  log "creating database ${DB_NAME}"
  psql_super "CREATE DATABASE ${DB_NAME}" >/dev/null || \
    log "could not create ${DB_NAME}"
fi

# 2. .env.local: vitest.config.ts loads it, so it must exist before tests run.
#    Keys stay empty so the app takes its documented no-key fallbacks.
if [ ! -f .env.local ]; then
  log "writing .env.local"
  cat > .env.local <<ENV
AUTH_SECRET=$(openssl rand -base64 32)
SEED_EMAIL=seed@example.com
SEED_PASSWORD=subscription-preview
DATABASE_URL=${DB_URL}
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

export DATABASE_URL="$DB_URL"

# 3. Dependencies. The hook runs on every session start, so skip the reinstall
#    when the environment cache already carries a matching node_modules.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  log "npm ci"
  npm ci --no-audit --no-fund
fi

# 4. Schema only. Do NOT seed.
#
#    lib/**/api.integration.test.ts insert their own fixtures in beforeAll using
#    the same fixed ids as lib/db/seed.ts. On a seeded database that beforeAll
#    dies on users_pkey and every test in the file is skipped, so `npm test`
#    reports a pass while 108 tests never ran. .github/workflows/ci.yml is green
#    for exactly this reason: it migrates and never seeds. Match it.
#
#    If you want data in the UI, run `npm run db:seed` by hand and expect the
#    integration suites to fail until the database is dropped and re-migrated.
log "npm run db:migrate"
npm run db:migrate

log "ready: ${DB_URL} (migrated, not seeded)"
exit 0
