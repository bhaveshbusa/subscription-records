import { and, eq, inArray } from "drizzle-orm";

import { subscriptions } from "@/lib/db/schema";
import { isRecordId } from "@/lib/db/ids";
import { applyLifecycleProposal, toLifecycleValues } from "@/lib/proposals/lifecycle";
import { rollNextRenewal } from "@/lib/subscriptions/dates";
import { HOLDING_STATUSES } from "@/lib/subscriptions/params";
import type { SubscriptionRow } from "@/lib/subscriptions/projection";
import { today } from "@/lib/subscriptions/query";
import type { WriteClient } from "@/lib/subscriptions/write";

export const OVERDUE_ACTIONS = ["still_holding", "cancelled"] as const;

export type OverdueAction = (typeof OVERDUE_ACTIONS)[number];

export type OverdueFailure = "not_found" | "not_overdue" | "no_cadence";

export type OverdueOutcome =
  | {
      ok: true;
      action: "still_holding";
      subscriptionId: string;
      provider: string;
      /** The stored date that had passed, and the one now in its place. */
      from: string;
      to: string;
    }
  | {
      ok: true;
      action: "cancelled";
      subscriptionId: string;
      provider: string;
      endsOn: string;
    }
  | { ok: false; error: OverdueFailure };

/**
 * The row an Overdue action is allowed to touch: the user's own, still holding,
 * and with a stored `next_renewal` that has actually passed. Anything else is
 * refused rather than guessed at — a second click after the row has already
 * been resolved must not roll the date a second time.
 */
async function overdueRow(
  client: WriteClient,
  options: { userId: string; id: string; on: string },
): Promise<SubscriptionRow | null> {
  if (!isRecordId(options.id)) {
    return null;
  }

  const [row] = await client
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, options.id)),
    )
    .limit(1);

  return row ?? null;
}

function isOverdue(row: SubscriptionRow, on: string): boolean {
  return (
    (HOLDING_STATUSES as readonly string[]).includes(row.status) &&
    row.next_renewal !== null &&
    row.next_renewal < on
  );
}

/**
 * What the user says about a holding row whose due date has passed. This is the
 * replacement for the lapse scan and for chat's still-holding question: nothing
 * infers either answer, and nothing writes `next_renewal` until one is given.
 *
 * **Still holding** rolls the schedule forward by cadence and marks the date
 * `inferred`. It is never `confirmed`: the user said they still have the
 * subscription, not that they checked the date. Amount and cadence are left
 * exactly as they were, and the row stays holding — so it leaves Overdue, and
 * may turn up under Renewing soon if the new date lands in one of its windows.
 *
 * **Cancelled** ends the row through the same lifecycle write an accepted
 * `cancelled` proposal uses, so there is one way a subscription ends. It is
 * dated at the stored due date the subscription never got past, which is a date
 * the ledger already holds — not today, which would be inventing an event on
 * the clock's say-so.
 */
export async function resolveOverdue(
  client: WriteClient,
  options: {
    userId: string;
    id: string;
    action: OverdueAction;
    now?: Date;
  },
): Promise<OverdueOutcome> {
  const now = options.now ?? new Date();
  const on = today(now);
  const row = await overdueRow(client, { userId: options.userId, id: options.id, on });

  if (!row) {
    return { ok: false, error: "not_found" };
  }

  if (!isOverdue(row, on)) {
    return { ok: false, error: "not_overdue" };
  }

  /** Guarded by `isOverdue`, which requires a stored date in the past. */
  const from = row.next_renewal as string;

  if (options.action === "cancelled") {
    const { values, endsOn, stillBilling } = toLifecycleValues(
      "cancelled",
      { endsOn: from },
      row,
      now,
    );

    await client
      .update(subscriptions)
      .set(values)
      .where(
        and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, row.id)),
      );

    await applyLifecycleProposal(client, {
      kind: "cancelled",
      subscription: row,
      endsOn,
      stillBilling,
      rationale: "Marked cancelled from Inbox: the due date passed and the user said it stopped.",
      now,
    });

    return {
      ok: true,
      action: "cancelled",
      subscriptionId: row.id,
      provider: row.provider_display,
      endsOn,
    };
  }

  if (!row.cadence) {
    return { ok: false, error: "no_cadence" };
  }

  const to = rollNextRenewal(from, row.cadence, on);

  await client
    .update(subscriptions)
    .set({
      next_renewal: to,
      /** Worked out from cadence, so inferred — the user confirmed no date. */
      renewal_field_status: "inferred",
      renewal_confidence: row.renewal_confidence,
      updated_at: now,
    })
    .where(
      and(
        eq(subscriptions.user_id, options.userId),
        eq(subscriptions.id, row.id),
        inArray(subscriptions.status, [...HOLDING_STATUSES]),
      ),
    );

  return {
    ok: true,
    action: "still_holding",
    subscriptionId: row.id,
    provider: row.provider_display,
    from,
    to,
  };
}
