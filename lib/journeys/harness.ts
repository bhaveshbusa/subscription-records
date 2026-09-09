import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/lib/db/schema";

/**
 * Shared plumbing for the stage-one journey suites (SUB-50).
 *
 * These suites differ from the per-module integration tests in one way that
 * matters: they start from an **empty ledger**. `docs/testing-and-signoff.md`
 * named that gap — every other check runs on `npm run db:seed`, so the path a
 * real user meets first was never exercised. A journey file therefore inserts a
 * user and nothing else, and builds the ledger the way a person would: capture,
 * review, accept.
 *
 * Consequence for ids: the seeded suites all insert `SEED_USER_ID`, so two of
 * them running at once block on `users_pkey` until the first transaction rolls
 * back. Journey suites take their own user id per file to stay off that lock
 * entirely — see `journeyUser`.
 */

export type Db = NodePgDatabase<typeof schema>;

/**
 * A user id and email unique to one journey file.
 *
 * `slot` must differ per file. The `00000000-0000-4000-8000-0000000005xx` block
 * is unused by `lib/db/seed-data.ts`, whose subscriptions, amendments, events,
 * proposals and preferences occupy the `1xxx`–`6xxx` tails of the same prefix.
 */
export function journeyUser(slot: number, label: string) {
  const tail = slot.toString(16).padStart(2, "0");

  return {
    id: `00000000-0000-4000-8000-0000000005${tail}`,
    email: `journey-${label}@example.com`,
    name: `Journey ${label}`,
  };
}

/** An id in the same per-file block, for fixtures a journey inserts directly. */
export function journeyId(slot: number, n: number) {
  return `00000000-0000-4000-8000-${slot.toString(16).padStart(4, "0")}${n
    .toString(16)
    .padStart(8, "0")}`;
}

/**
 * A UTC calendar date offset from a base day, in the `YYYY-MM-DD` form the
 * whole codebase compares on (`calendarToday`, `today`).
 */
export function dayOffset(days: number, from = new Date()) {
  const date = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

/** Midday UTC, so a fake clock lands unambiguously inside the intended day. */
export function noonOn(date: string) {
  return new Date(`${date}T12:00:00.000Z`);
}

/**
 * The routes call `getDb().transaction(...)`, but a journey file holds one
 * connection inside a single `begin`/`rollback`. Postgres has no nested
 * transaction over one connection, so `transaction` is flattened onto the same
 * client. Identical to the proxy each per-module integration suite builds.
 */
export function shareConnection(db: Db): Db {
  return new Proxy(db, {
    get(target, property) {
      if (property === "transaction") {
        return (run: (tx: Db) => unknown) => run(target);
      }

      const value = Reflect.get(target, property, target);

      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Db;
}

/** JSON request helper: the routes read a `Request`, not a parsed body. */
export function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
