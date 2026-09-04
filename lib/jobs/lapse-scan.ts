import { and, eq, inArray, isNotNull, lt, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { subscriptions } from "@/lib/db/schema";
import { rollNextRenewal } from "@/lib/subscriptions/dates";
import { HOLDING_STATUSES } from "@/lib/subscriptions/params";
import { today } from "@/lib/subscriptions/query";

export type ScanClient = Pick<NodePgDatabase, "select" | "update">;

type HoldingRow = {
  id: string;
  user_id: string;
  provider_display: string;
  cadence: NonNullable<(typeof subscriptions.cadence.enumValues)[number]>;
  next_renewal: string;
  renewal_confidence: (typeof subscriptions.renewal_confidence.enumValues)[number] | null;
};

export type RollSkipReason = "no_cadence" | "already_current";

export type LapseScanResult = {
  /** Holding rows whose stored `next_renewal` is in the past. */
  scanned: number;
  /** Always empty: silence is not a lapse, so this scan never proposes one. */
  proposed: [];
  rolled: {
    subscriptionId: string;
    provider: string;
    from: string;
    to: string;
  }[];
  skipped: {
    subscriptionId: string;
    provider: string;
    renewalDue: string;
    reason: RollSkipReason;
  }[];
};

export type LapseScanResponse = LapseScanResult;

async function staleHoldings(
  client: ScanClient,
  options: { userId: string | null; on: string },
): Promise<
  {
    id: string;
    user_id: string;
    provider_display: string;
    cadence: (typeof subscriptions.cadence.enumValues)[number] | null;
    next_renewal: string | null;
    renewal_confidence: (typeof subscriptions.renewal_confidence.enumValues)[number] | null;
  }[]
> {
  const conditions: SQL[] = [
    inArray(subscriptions.status, [...HOLDING_STATUSES]),
    isNotNull(subscriptions.next_renewal),
    lt(subscriptions.next_renewal, options.on),
  ];

  if (options.userId) {
    conditions.push(eq(subscriptions.user_id, options.userId));
  }

  return client
    .select({
      id: subscriptions.id,
      user_id: subscriptions.user_id,
      provider_display: subscriptions.provider_display,
      cadence: subscriptions.cadence,
      next_renewal: subscriptions.next_renewal,
      renewal_confidence: subscriptions.renewal_confidence,
    })
    .from(subscriptions)
    .where(and(...conditions))
    .orderBy(subscriptions.next_renewal);
}

/**
 * Rolls a stale `next_renewal` forward by cadence until today or later, and
 * marks it `inferred`. A confirmed date that has already passed is no longer
 * that next due date; inferring the next one is the correction, not a silent
 * confirm.
 *
 * The scan never proposes `lapsed`. Silence and a passed date are not evidence
 * the subscription stopped. `lapsed` is only when the user says so.
 *
 * Runs for one user when given a `userId`, and across every user otherwise,
 * which is what the nightly cron does.
 */
export async function scanForLapses(
  client: ScanClient,
  options: { userId?: string | null; now?: Date } = {},
): Promise<LapseScanResult> {
  const now = options.now ?? new Date();
  const on = today(now);
  const rows = await staleHoldings(client, { userId: options.userId ?? null, on });
  const result: LapseScanResult = { scanned: rows.length, proposed: [], rolled: [], skipped: [] };

  for (const row of rows) {
    if (!row.next_renewal) {
      continue;
    }

    if (!row.cadence) {
      result.skipped.push({
        subscriptionId: row.id,
        provider: row.provider_display,
        renewalDue: row.next_renewal,
        reason: "no_cadence",
      });
      continue;
    }

    const to = rollNextRenewal(row.next_renewal, row.cadence, on);

    if (to === row.next_renewal) {
      result.skipped.push({
        subscriptionId: row.id,
        provider: row.provider_display,
        renewalDue: row.next_renewal,
        reason: "already_current",
      });
      continue;
    }

    const holding: HoldingRow = {
      id: row.id,
      user_id: row.user_id,
      provider_display: row.provider_display,
      cadence: row.cadence,
      next_renewal: row.next_renewal,
      renewal_confidence: row.renewal_confidence,
    };

    await client
      .update(subscriptions)
      .set({
        next_renewal: to,
        renewal_field_status: "inferred",
        renewal_confidence: holding.renewal_confidence,
        updated_at: now,
      })
      .where(
        and(eq(subscriptions.id, holding.id), eq(subscriptions.user_id, holding.user_id)),
      );

    result.rolled.push({
      subscriptionId: holding.id,
      provider: holding.provider_display,
      from: holding.next_renewal,
      to,
    });
  }

  return result;
}
