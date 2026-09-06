// Fail loudly when a migration run left no schema behind.
//
// `drizzle-kit migrate` records applied migrations in `drizzle.__drizzle_migrations`,
// a different schema from the tables themselves. Drop `public` without dropping
// `drizzle` and the journal survives claiming everything is applied, so the next
// `db:migrate` no-ops AND PRINTS "migrations applied successfully" while leaving
// an empty database. A branch in that state passes its build and then 500s on
// every request, and anything forked from it inherits the same lie.
//
// So we do not trust the migrator's exit code; we check for a table.

import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.log("[assert-schema] no DATABASE_URL; nothing to check");
  process.exit(0);
}

const client = new Client({ connectionString });
await client.connect();

try {
  const { rows } = await client.query(
    "select to_regclass('public.users') is not null as present",
  );

  if (!rows[0]?.present) {
    console.error(
      "[assert-schema] migrations reported success but public.users does not exist.\n" +
        "The migration journal in the 'drizzle' schema almost certainly survived a\n" +
        "wipe that only dropped 'public', so drizzle believes every migration is\n" +
        "already applied. Reset the branch with BOTH schemas dropped:\n" +
        "  DROP SCHEMA IF EXISTS public CASCADE;\n" +
        "  DROP SCHEMA IF EXISTS drizzle CASCADE;\n" +
        "  CREATE SCHEMA public;\n" +
        "then migrate again. See docs/architecture.md, 'Resetting a branch'.",
    );
    process.exit(1);
  }

  console.log("[assert-schema] schema present");
} finally {
  await client.end();
}
