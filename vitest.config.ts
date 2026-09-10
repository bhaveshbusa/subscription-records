import { resolve } from "node:path";

import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

dotenv.config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
dotenv.config({ path: resolve(process.cwd(), ".env"), quiet: true });

/**
 * The integration suites must never run against a seeded database. They insert
 * their own fixtures in `beforeAll` using the same fixed ids as
 * `lib/db/seed-data.ts`, so seed rows make every one of them die on
 * `users_pkey` — and because that happens in `beforeAll`, Vitest reports the
 * files as skipped and `npm test` still exits 0. See SUB-37.
 *
 * So the suite chooses its own database rather than inheriting `DATABASE_URL`
 * from `.env.local`, which points at development data:
 *
 *   1. TEST_DATABASE_URL          you pointed it somewhere yourself
 *   2. DATABASE_URL, in CI or a   both already provide a migrated, unseeded
 *      cloud session              database of their own
 *   3. the Docker container       everywhere else, i.e. a laptop
 *
 * `scripts/test-db.sh` implements the same precedence; keep the two in step.
 */
const LOCAL_TEST_DATABASE_URL =
  "postgres://postgres:postgres@localhost:5433/subscription_records_test";

/**
 * `??` alone is not enough here: `.env.example` ships `TEST_DATABASE_URL` blank,
 * so a copied `.env.local` sets it to "" — which is not nullish, would win the
 * `??`, and would leave `DATABASE_URL` pointing at development data. Treat a
 * blank value as absent.
 */
const set = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const providedByEnvironment =
  Boolean(set(process.env.CI)) || process.env.CLAUDE_CODE_REMOTE === "true";

const testDatabaseUrl =
  set(process.env.TEST_DATABASE_URL) ??
  (providedByEnvironment ? set(process.env.DATABASE_URL) : LOCAL_TEST_DATABASE_URL);

if (testDatabaseUrl) {
  process.env.DATABASE_URL = testDatabaseUrl;
}

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(process.cwd()),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./vitest.global-setup.ts"],
    /**
     * The integration suites connect and insert their fixtures in `beforeAll`,
     * and they all do it at once: with enough of them in one run, a connection
     * and a dozen inserts can take longer than the 10s default on a laptop.
     * That failure is worse than it looks — a `beforeAll` that times out marks
     * the whole file *skipped*, which is the shape SUB-37 warned about — so the
     * hook gets room to be slow. A suite that actually hangs still fails here.
     */
    hookTimeout: 30_000,
  },
});
