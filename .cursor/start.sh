#!/usr/bin/env bash
#
# Cloud Agent start phase for the subscription recorder.
#
# Runs on every boot. Postgres and node_modules already exist (from the build
# snapshot or a prior install), so this only reconciles per-boot runtime state:
# start the database, make sure config is present, and apply any migrations the
# checked-out branch adds on top of the snapshot. It must tolerate restarts.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

log() { printf '[start] %s\n' "$1"; }

if [ "$(id -u)" -eq 0 ]; then
  as_root() { "$@"; }
elif command -v sudo >/dev/null 2>&1; then
  as_root() { sudo -n "$@"; }
else
  as_root() { "$@"; }
fi

# Containers have no init system: start the cluster if it is not already up.
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

# A fresh checkout may not carry the git-ignored .env.local; recreate it so the
# app, drizzle and vitest can read their configuration.
if [ ! -f .env.local ]; then
  log "recreating .env.local"
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

BASHRC="${HOME}/.bashrc"
EXPORT_LINE='export TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/subscription_records_test"'
if [ -f "$BASHRC" ] && ! grep -qF "$EXPORT_LINE" "$BASHRC"; then
  printf '\n# subscription-records: point `npm test` at the unseeded test database\n%s\n' \
    "$EXPORT_LINE" >> "$BASHRC"
fi

# Apply any migrations the checked-out branch adds beyond the snapshot. Idempotent.
log "applying migrations"
npm run db:migrate --silent
DATABASE_URL="postgres://postgres:postgres@localhost:5432/subscription_records_test" \
  npm run db:migrate --silent

log "ready"
