// Answer "which database am I actually pointed at?".
//
// Neon branch names do not travel in the connection string, but each branch has
// its own compute endpoint, so the host identifies the branch. Compare the host
// printed here with the branch's connection string in the Neon console.
//
// The row counts are a second, independent signal, because each branch in this
// project is meant to look different:
//
//   template    no tables at all         (previews are built from empty)
//   production  tables, 0 subscriptions  (migrated, never seeded)
//   dev         tables, seeded rows
//   preview/*   tables, seeded rows
//
// Usage: DATABASE_URL='…' npm run db:whoami

import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Set DATABASE_URL, e.g. DATABASE_URL='…' npm run db:whoami");
  process.exit(1);
}

let host = "unparseable";
try {
  const url = new URL(connectionString);
  host = `${url.hostname}${url.pathname}`;
} catch {}

const client = new Client({ connectionString });

try {
  await client.connect();
} catch (error) {
  console.error(`host      ${host}\nconnect   FAILED: ${error.message}`);
  process.exit(1);
}

try {
  const q = async (sql) => (await client.query(sql)).rows[0];

  const { tables } = await q(
    "select count(*)::int as tables from information_schema.tables where table_schema = 'public'",
  );
  // Check the journal table exists before counting it. A subquery against a
  // missing relation fails at parse time, so coalesce cannot rescue it - and a
  // missing drizzle schema is exactly what a correct `template` looks like.
  const journalPresent = (
    await q("select to_regclass('drizzle.__drizzle_migrations') is not null as present")
  ).present;

  const journal = journalPresent
    ? (await q("select count(*)::int as journal from drizzle.__drizzle_migrations")).journal
    : 0;
  const hasUsers = (await q("select to_regclass('public.users') is not null as present")).present;

  const counts = hasUsers
    ? await q("select (select count(*)::int from users) as users, (select count(*)::int from subscriptions) as subscriptions")
    : { users: null, subscriptions: null };

  let looksLike = "unrecognised";
  if (tables === 0 && journal === 0) looksLike = "template (empty, as intended)";
  else if (tables === 0 && journal > 0) looksLike = "BROKEN: journal survived a wipe that spared the drizzle schema";
  else if (hasUsers && counts.subscriptions === 0) looksLike = "production (migrated, never seeded)";
  else if (hasUsers && counts.subscriptions > 0) looksLike = "dev or a preview branch (seeded)";

  console.log(`host           ${host}`);
  console.log(`public tables  ${tables}`);
  console.log(`journal rows   ${journal}`);
  console.log(`users          ${counts.users ?? "-"}`);
  console.log(`subscriptions  ${counts.subscriptions ?? "-"}`);
  console.log(`looks like     ${looksLike}`);
} finally {
  await client.end();
}
