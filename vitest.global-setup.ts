import { Client } from "pg";

import { SEED_USER_ID } from "./lib/db/seed-data";

/**
 * Fail loudly before a single test runs if the target database is not what the
 * suite needs.
 *
 * The failure this exists to prevent is silent: on a seeded database every
 * integration `beforeAll` dies on `users_pkey`, Vitest marks those files
 * skipped, and `npm test` exits 0 having not run 108 tests. A green run that
 * asserted nothing is worse than a red one. See SUB-37.
 */
export default async function setup() {
  const connectionString = process.env.DATABASE_URL;

  // No database configured: the integration suites skip themselves via
  // `describe.runIf(hasDatabase)`, and the unit tests do not need one.
  if (!connectionString) return;

  const client = new Client({ connectionString });

  try {
    await client.connect();
  } catch (cause) {
    throw new Error(
      `Cannot reach the test database at ${redact(connectionString)}.\n` +
        "Start it with 'npm run test:db:up', or point the suite elsewhere with " +
        "TEST_DATABASE_URL.",
      { cause },
    );
  }

  try {
    const { rows: table } = await client.query(
      "select to_regclass('public.users') as name",
    );

    if (!table[0]?.name) {
      throw new Error(
        `The test database at ${redact(connectionString)} has no schema.\n` +
          "Run 'npm run db:migrate' against it first.",
      );
    }

    const { rowCount } = await client.query(
      "select 1 from users where id = $1 limit 1",
      [SEED_USER_ID],
    );

    if (rowCount) {
      throw new Error(
        `The test database at ${redact(connectionString)} contains seed data.\n` +
          "The integration suites insert the same fixed ids as lib/db/seed.ts, " +
          "so every one of them would fail in beforeAll and be reported as " +
          "skipped.\n" +
          "Use an unseeded database: 'npm run test:db:up' starts one, or set " +
          "TEST_DATABASE_URL. Never run 'npm run db:seed' against it.",
      );
    }
  } finally {
    await client.end();
  }
}

/** Keep credentials out of the error text. */
function redact(connectionString: string) {
  try {
    const url = new URL(connectionString);
    url.password = "";
    url.username = "";
    return `${url.host}${url.pathname}`;
  } catch {
    return "the configured DATABASE_URL";
  }
}
