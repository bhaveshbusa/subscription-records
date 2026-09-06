#!/usr/bin/env bash
#
# Bring up the ephemeral test database and migrate it. Runs from `pretest`, so
# `npm test` on a laptop is a single command.
#
# It deliberately does nothing where a suitable database already exists:
#   - CI                 .github/workflows/ci.yml runs a postgres:16 service
#   - a cloud session    scripts/cloud-setup.sh starts the sandbox's Postgres
#   - TEST_DATABASE_URL  you pointed the suite somewhere yourself
# The same precedence is implemented in vitest.config.ts; keep the two in step.
#
# It never seeds. See docker-compose.yml for why that matters.

set -euo pipefail

if [ -n "${TEST_DATABASE_URL:-}" ]; then
  echo "[test-db] TEST_DATABASE_URL is set; using it as-is"
  exit 0
fi

if [ -n "${CI:-}" ] || [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  echo "[test-db] CI or cloud session; using the database already provided"
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  cat >&2 <<'MSG'
[test-db] Docker is not installed.

`npm test` uses an ephemeral postgres:16 container so the suite never runs
against your seeded development database. Either install Docker, or point the
suite at your own empty, migrated database:

    TEST_DATABASE_URL='postgres://…' npm test
MSG
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  start_hint="start your Docker runtime"
  command -v colima >/dev/null 2>&1 && start_hint="run 'colima start'"
  [ -d "/Applications/Docker.app" ] && start_hint="start Docker Desktop"

  cat >&2 <<MSG
[test-db] The Docker CLI is installed but no daemon is reachable.

Please ${start_hint} and run 'npm test' again, or point the suite at your own
empty, migrated database:

    TEST_DATABASE_URL='postgres://…' npm test
MSG
  exit 1
fi

TEST_DB_URL="postgres://postgres:postgres@localhost:5433/subscription_records_test"

echo "[test-db] starting postgres:16 on port 5433"
docker compose up -d --wait test-db

echo "[test-db] applying migrations"
DATABASE_URL="$TEST_DB_URL" npm run db:migrate --silent

echo "[test-db] ready (unseeded, discarded on 'npm run test:db:down')"
