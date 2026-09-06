#!/usr/bin/env bash
#
# Build entry point. Locally this is just `next build`. On Vercel it also brings
# the deployment's own database up to date first.
#
# Why here and not in the Vercel console: this is the schema contract for every
# deployment, so it belongs in the repo where it is reviewed, not in a settings
# field nobody sees in a diff.
#
# Preview deployments get their own Neon branch, created by the Neon Postgres
# Previews integration and injected as DATABASE_URL for that deployment only. A
# fresh branch is forked from `production`, so it carries production's schema and
# NOT this pull request's migration - which is exactly why the migration has to
# run here, before the app serves traffic.

set -euo pipefail

log() { printf '[build] %s\n' "$1"; }

# Not on Vercel: never touch a database from a local `npm run build`.
if [ -z "${VERCEL:-}" ]; then
  exec npx next build
fi

# Migrations and seeding open one direct connection and are not hot paths, so
# prefer the unpooled string. Neon's integration sets both; running DDL through
# the pooler is the documented way to get odd failures.
MIGRATION_URL="${DATABASE_URL_UNPOOLED:-${DATABASE_URL:-}}"

if [ -z "$MIGRATION_URL" ]; then
  log "no DATABASE_URL for VERCEL_ENV=${VERCEL_ENV:-unknown}; skipping migrate"
else
  log "applying migrations (VERCEL_ENV=${VERCEL_ENV:-unknown})"
  DATABASE_URL="$MIGRATION_URL" npm run db:migrate

  # Preview only. Production is a real inventory and must never be seeded; the
  # test databases are ephemeral and must never be seeded either (see SUB-37).
  if [ "${VERCEL_ENV:-}" = "preview" ]; then
    log "seeding preview database so the PR has something to sign off against"
    DATABASE_URL="$MIGRATION_URL" npm run db:seed
  else
    log "not a preview deployment; not seeding"
  fi
fi

exec npx next build
