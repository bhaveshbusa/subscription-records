import { and, eq, inArray, isNotNull, lt, max, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { charges, proposals, subscriptions } from "@/lib/db/schema";
import { parseProposalPayload, type ProposalPayload } from "@/lib/proposals/payload";
import { toProposalView, type ProposalView } from "@/lib/proposals/projection";
import { addDays } from "@/lib/subscriptions/dates";
import { today } from "@/lib/subscriptions/query";

export type ScanClient = Pick<NodePgDatabase, "select" | "insert">;

/**
 * How long after a missed renewal the scan waits before saying anything. A
 * renewal date is a prediction, and billing runs late, so a day or two past it
 * is not evidence of anything.
 */
export const LAPSE_GRACE_DAYS = 7;

/** The renewal date on or before which a missed renewal is worth raising. */
export function lapseCutoff(now: Date): string {
  return addDays(today(now), -LAPSE_GRACE_DAYS);
}

type LapseRow = {
  id: string;
  user_id: string;
  provider_display: string;
  next_renewal: string;
  renewal_field_status: (typeof subscriptions.renewal_field_status.enumValues)[number];
};

/**
 * Why a subscription the scan looked at was left alone. `billing_continued` is a
 * payment dated on or after the renewal, so the renewal happened; `declined` is
 * the user having already rejected this same lapse.
 */
export type LapseSkipReason = "billing_continued" | "already_proposed" | "declined";

export type LapseScanResult = {
  /** Subscriptions whose renewal is past the grace period. */
  scanned: number;
  proposed: {
    subscriptionId: string;
    provider: string;
    renewalDue: string;
    daysOverdue: number;
    proposal: ProposalView;
  }[];
  skipped: {
    subscriptionId: string;
    provider: string;
    renewalDue: string;
    reason: LapseSkipReason;
  }[];
};

/** The manual run's answer: what it found, and the window it looked in. */
export type LapseScanResponse = LapseScanResult & {
  graceDays: number;
  renewalCutoff: string;
};

/** Whole days between two calendar dates, in UTC. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);

  return Math.round((end - start) / 86_400_000);
}

/**
 * A lapse is read off a renewal date, so it is only as good as that date: one
 * the user confirmed is worth a `medium`, an inferred or proposed one no more
 * than a `low`. Neither is ever high, because nothing here saw a bank statement.
 */
export function lapseConfidence(row: Pick<LapseRow, "renewal_field_status">) {
  return row.renewal_field_status === "confirmed" ? ("medium" as const) : ("low" as const);
}

/**
 * What the scan proposes: the status it thinks the subscription is in, and the
 * day billing stopped, which is the renewal that never happened. Both are
 * proposals — `subscriptionStatus` carries `proposed`, so accepting is what
 * moves the row, and nothing here writes to the ledger.
 */
export function toLapsePayload(row: Pick<LapseRow, "next_renewal" | "renewal_field_status">) {
  return {
    subscriptionStatus: {
      value: "lapsed" as const,
      status: "proposed" as const,
      confidence: lapseConfidence(row),
    },
    endsOn: row.next_renewal,
  } satisfies ProposalPayload;
}

/**
 * Whether this overdue renewal should be left alone. A payment dated on or
 * after it means the renewal happened, whatever the row still says; a lapse
 * already in the inbox is the same question a second time; and a rejected one is
 * the user having said the subscription is still running.
 */
export function lapseSkipReason(options: {
  renewalDue: string;
  lastPaidOn: string | null;
  hasPendingLapse: boolean;
  declinedRenewals: readonly string[];
}): LapseSkipReason | null {
  if (options.lastPaidOn && options.lastPaidOn >= options.renewalDue) {
    return "billing_continued";
  }

  if (options.hasPendingLapse) {
    return "already_proposed";
  }

  return options.declinedRenewals.includes(options.renewalDue) ? "declined" : null;
}

export function lapseRationale(row: Pick<LapseRow, "next_renewal">, now: Date): string {
  const daysOverdue = daysBetween(row.next_renewal, today(now));

  return `Daily lapse scan: renewal was due ${row.next_renewal}, ${daysOverdue} days ago, and no payment has been recorded since. It may have lapsed.`;
}

/** The renewal date a lapse proposal was about, so the same one is not re-raised. */
function proposedEndsOn(payload: unknown): string | null {
  const parsed = parseProposalPayload("lapsed", payload);

  return parsed.success ? (parsed.payload.endsOn ?? null) : null;
}

async function overdueSubscriptions(
  client: ScanClient,
  options: { userId: string | null; now: Date },
): Promise<LapseRow[]> {
  const conditions: SQL[] = [
    eq(subscriptions.status, "active"),
    isNotNull(subscriptions.next_renewal),
    lt(subscriptions.next_renewal, lapseCutoff(options.now)),
  ];

  if (options.userId) {
    conditions.push(eq(subscriptions.user_id, options.userId));
  }

  const rows = await client
    .select({
      id: subscriptions.id,
      user_id: subscriptions.user_id,
      provider_display: subscriptions.provider_display,
      next_renewal: subscriptions.next_renewal,
      renewal_field_status: subscriptions.renewal_field_status,
    })
    .from(subscriptions)
    .where(and(...conditions))
    .orderBy(subscriptions.next_renewal);

  return rows.filter((row): row is LapseRow => row.next_renewal !== null);
}

/** The last payment recorded against each of these subscriptions. */
async function lastPaidOn(
  client: ScanClient,
  subscriptionIds: string[],
): Promise<Map<string, string>> {
  const rows = await client
    .select({
      subscription_id: charges.subscription_id,
      paid_on: max(charges.paid_on),
    })
    .from(charges)
    .where(inArray(charges.subscription_id, subscriptionIds))
    .groupBy(charges.subscription_id);

  return new Map(
    rows.flatMap((row) => (row.paid_on ? [[row.subscription_id, row.paid_on] as const] : [])),
  );
}

/**
 * Lapses already put to the user for these subscriptions: one still waiting in
 * the inbox, and the renewal dates of ones they turned down. A rejected lapse is
 * an answer — the subscription is still running — so the scan does not ask again
 * about that renewal.
 */
async function decidedLapses(
  client: ScanClient,
  subscriptionIds: string[],
): Promise<{ pending: Set<string>; declined: Map<string, Set<string>> }> {
  const rows = await client
    .select({
      subscription_id: proposals.subscription_id,
      state: proposals.state,
      payload: proposals.payload,
    })
    .from(proposals)
    .where(
      and(
        eq(proposals.kind, "lapsed"),
        inArray(proposals.subscription_id, subscriptionIds),
        inArray(proposals.state, ["pending", "rejected"]),
      ),
    );
  const pending = new Set<string>();
  const declined = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row.subscription_id) {
      continue;
    }

    if (row.state === "pending") {
      pending.add(row.subscription_id);
      continue;
    }

    const endsOn = proposedEndsOn(row.payload);

    if (endsOn) {
      const dates = declined.get(row.subscription_id) ?? new Set<string>();

      dates.add(endsOn);
      declined.set(row.subscription_id, dates);
    }
  }

  return { pending, declined };
}

/**
 * Looks for subscriptions that quietly stopped: still `active`, a renewal date
 * well past, and no payment since. Each one becomes a **pending** `lapsed`
 * proposal for the inbox. The scan never writes a status — a subscription only
 * becomes `lapsed` when the user accepts, which is the difference between a
 * ledger that records what happened and one that guesses.
 *
 * Runs for one user when given a `userId`, and across every user otherwise,
 * which is what the nightly cron does.
 */
export async function scanForLapses(
  client: ScanClient,
  options: { userId?: string | null; now?: Date } = {},
): Promise<LapseScanResult> {
  const now = options.now ?? new Date();
  const rows = await overdueSubscriptions(client, {
    userId: options.userId ?? null,
    now,
  });
  const result: LapseScanResult = { scanned: rows.length, proposed: [], skipped: [] };

  if (rows.length === 0) {
    return result;
  }

  const ids = rows.map((row) => row.id);
  const [paid, lapses] = await Promise.all([
    lastPaidOn(client, ids),
    decidedLapses(client, ids),
  ]);
  const raising: LapseRow[] = [];

  for (const row of rows) {
    const reason = lapseSkipReason({
      renewalDue: row.next_renewal,
      lastPaidOn: paid.get(row.id) ?? null,
      hasPendingLapse: lapses.pending.has(row.id),
      declinedRenewals: [...(lapses.declined.get(row.id) ?? [])],
    });

    if (reason) {
      result.skipped.push({
        subscriptionId: row.id,
        provider: row.provider_display,
        renewalDue: row.next_renewal,
        reason,
      });
      continue;
    }

    raising.push(row);
  }

  if (raising.length === 0) {
    return result;
  }

  const raised = await client
    .insert(proposals)
    .values(
      raising.map((row) => ({
        user_id: row.user_id,
        subscription_id: row.id,
        kind: "lapsed" as const,
        state: "pending" as const,
        payload: toLapsePayload(row),
        rationale: lapseRationale(row, now),
        confidence: lapseConfidence(row),
      })),
    )
    .returning();

  result.proposed = raising.map((row, index) => ({
    subscriptionId: row.id,
    provider: row.provider_display,
    renewalDue: row.next_renewal,
    daysOverdue: daysBetween(row.next_renewal, today(now)),
    proposal: toProposalView(raised[index], row.provider_display),
  }));

  return result;
}
