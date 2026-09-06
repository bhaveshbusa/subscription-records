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
# Previews integration and injected as DATABASE_URL for that deployment only.
#
# That branch is forked from the project's DEFAULT branch, which is a deliberately
# empty `template` - not production, so no real inventory is ever copied into a
# preview. A fresh branch therefore has no schema at all, which is why migrating
# here, before the app serves traffic, is what makes a preview exist.
# See docs/architecture.md, "Neon branch topology".

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

# The build only needs one of the two, but the running app reads DATABASE_URL
# specifically (lib/db/index.ts) and throws without it. A deployment with only
# DATABASE_URL_UNPOOLED set therefore builds green, migrates happily, and then
# fails on the first request. Catch that here instead.
if [ -n "$MIGRATION_URL" ] && [ -z "${DATABASE_URL:-}" ]; then
  cat >&2 <<'MSG'
[build] DATABASE_URL is not set for this deployment, only DATABASE_URL_UNPOOLED.

The build could migrate with the unpooled string, but the app reads DATABASE_URL
at runtime and would throw on every request. Set DATABASE_URL for this
environment before deploying.
MSG
  exit 1
fi

if [ -z "$MIGRATION_URL" ]; then
  log "no DATABASE_URL for VERCEL_ENV=${VERCEL_ENV:-unknown}; skipping migrate"
else
  # Say which database this deployment is actually using. Without this the log
  # cannot answer "did this preview get its own branch, or is every preview
  # sharing one database?" - and a static DATABASE_URL on the Preview environment
  # shadows any per-deployment value, so they look identical from the outside.
  log "database host: $(MIGRATION_URL="$MIGRATION_URL" node -e 'try{const u=new URL(process.env.MIGRATION_URL);console.log(u.hostname+u.pathname)}catch{console.log("unparseable")}' 2>/dev/null || echo unknown)"

  log "applying migrations (VERCEL_ENV=${VERCEL_ENV:-unknown})"
  DATABASE_URL="$MIGRATION_URL" npm run db:migrate

  # Do not trust that exit code. drizzle-kit reports success when it applies
  # nothing, which is what happens against a branch whose migration journal
  # (drizzle.__drizzle_migrations, a separate schema) outlived its tables.
  if ! MIGRATION_URL="$MIGRATION_URL" node -e '
    const { Client } = require("pg");
    const client = new Client({ connectionString: process.env.MIGRATION_URL });
    client
      .connect()
      .then(() => client.query("select to_regclass($1) is not null as ok", ["public.users"]))
      .then(({ rows }) => { if (!rows[0].ok) throw new Error("public.users is missing"); })
      .then(() => client.end())
      .catch((error) => { console.error(error.message); process.exit(1); });
  '; then
    cat >&2 <<'MSG'
[build] Migrations reported success but the schema is not there.

The migration journal lives in the `drizzle` schema, not `public`. If a reset
dropped only `public`, the journal survives claiming every migration is applied
and drizzle-kit does nothing while reporting success. Reset with BOTH dropped:

  DROP SCHEMA IF EXISTS public CASCADE;
  DROP SCHEMA IF EXISTS drizzle CASCADE;
  CREATE SCHEMA public;
MSG
    exit 1
  fi

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
