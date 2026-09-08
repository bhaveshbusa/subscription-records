import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { subscriptions } from "@/lib/db/schema";
import { isRecordId } from "@/lib/db/ids";
import { applyLifecycleProposal, toLifecycleValues } from "@/lib/proposals/lifecycle";
import { calendarToday, rollNextRenewal } from "@/lib/subscriptions/dates";
import { calendarDateSchema, HOLDING_STATUSES } from "@/lib/subscriptions/params";
import type { SubscriptionRow } from "@/lib/subscriptions/projection";
import { isHoldingOverdue, scheduleFactsFromRow } from "@/lib/subscriptions/schedule";
import type { WriteClient } from "@/lib/subscriptions/write";

export const OVERDUE_ACTIONS = ["still_holding", "cancelled"] as const;

export type OverdueAction = (typeof OVERDUE_ACTIONS)[number];

export type OverdueFailure =
  | "not_found"
  | "not_overdue"
  | "no_cadence"
  | "no_renewal"
  | "needs_end_date";

export const overdueCancelBodySchema = z
  .object({
    endsOn: calendarDateSchema.optional(),
    notes: z.string().trim().max(4000).optional(),
    unknownTiming: z.boolean().optional(),
  })
  .strict();

export type OverdueCancelBody = z.infer<typeof overdueCancelBodySchema>;

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
  | {
      ok: true;
      action: "unresolved";
      subscriptionId: string;
      provider: string;
      notesSaved: boolean;
    }
  | { ok: false; error: OverdueFailure };

/**
 * The row an Overdue action is allowed to touch: the user's own, still holding,
 * and still overdue under the schedule rules. Anything else is refused rather
 * than guessed at — a second click after the row has already been resolved must
 * not roll the date a second time.
 */
async function overdueRow(
  client: WriteClient,
  options: { userId: string; id: string },
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

function combinedNotes(existing: string | null, incoming: string | undefined): string | null {
  const next = incoming?.trim() ?? "";

  if (next === "") {
    return existing;
  }

  if (!existing || existing.trim() === "") {
    return next;
  }

  if (existing.includes(next)) {
    return existing;
  }

  return `${existing}\n\n${next}`;
}

/**
 * What the user says about a holding row whose due date has passed. This is the
 * replacement for the lapse scan and for chat's still-holding question: nothing
 * infers either answer, and nothing writes `next_renewal` until one is given.
 *
 * **Still holding** rolls the schedule forward by cadence and marks the date
 * `inferred`. It is never `confirmed`: the user said they still have the
 * subscription, not that they checked the date. Amount and cadence are left
 * exactly as they were, and the row stays holding — so it leaves Overdue. A
 * reminder card appears only when an enabled preference's window is active.
 *
 * **Cancelled** ends the row through the same lifecycle write an accepted
 * `cancelled` proposal uses, so there is one way a subscription ends. The user
 * must state the actual end date. A stale stored renewal is not that date. If
 * timing is unknown, the row stays unresolved and notes may be stored.
 */
export async function resolveOverdue(
  client: WriteClient,
  options: {
    userId: string;
    id: string;
    action: OverdueAction;
    now?: Date;
    endsOn?: string;
    notes?: string;
    unknownTiming?: boolean;
  },
): Promise<OverdueOutcome> {
  const now = options.now ?? new Date();
  const on = calendarToday(now);
  const row = await overdueRow(client, { userId: options.userId, id: options.id });

  if (!row) {
    return { ok: false, error: "not_found" };
  }

  if (!isHoldingOverdue(scheduleFactsFromRow(row), on)) {
    return { ok: false, error: "not_overdue" };
  }

  if (options.action === "cancelled") {
    if (options.unknownTiming) {
      const notes = combinedNotes(row.notes, options.notes);

      if (notes !== row.notes) {
        await client
          .update(subscriptions)
          .set({ notes, updated_at: now })
          .where(
            and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, row.id)),
          );
      }

      return {
        ok: true,
        action: "unresolved",
        subscriptionId: row.id,
        provider: row.provider_display,
        notesSaved: notes !== row.notes,
      };
    }

    if (!options.endsOn) {
      return { ok: false, error: "needs_end_date" };
    }

    const { values, endsOn, stillBilling } = toLifecycleValues(
      "cancelled",
      { endsOn: options.endsOn },
      row,
      now,
    );
    const notes = combinedNotes(row.notes, options.notes);

    if (notes !== row.notes) {
      values.notes = notes;
    }

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
      rationale: "Marked cancelled from Inbox after reviewing the actual end date.",
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

  if (!row.next_renewal) {
    return { ok: false, error: "no_renewal" };
  }

  if (!row.cadence) {
    return { ok: false, error: "no_cadence" };
  }

  const from = row.next_renewal;
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
