import { and, eq, isNull } from "drizzle-orm";

import { amendments, events } from "@/lib/db/schema";
import { addDays } from "@/lib/subscriptions/dates";
import type { SubscriptionRow } from "@/lib/subscriptions/projection";
import { today } from "@/lib/subscriptions/query";
import { syncOpenAmendment, type WriteClient } from "@/lib/subscriptions/write";

/** The terms an amendment records: what the subscription costs, and for what. */
export type Terms = {
  amountMinor: number | null;
  currency: string;
  cadence: SubscriptionRow["cadence"];
  plan: string | null;
};

export function termsOf(row: SubscriptionRow): Terms {
  return {
    amountMinor: row.amount_minor,
    currency: row.currency,
    cadence: row.cadence,
    plan: row.plan,
  };
}

export function termsDiffer(before: Terms, after: Terms): boolean {
  return (
    before.amountMinor !== after.amountMinor ||
    before.currency !== after.currency ||
    before.cadence !== after.cadence ||
    before.plan !== after.plan
  );
}

export type TermsChange = {
  effectiveFrom: string;
  /**
   * The amendment the change closed, or null when the new terms start on or
   * before the day the open one began: nothing was in force long enough to keep,
   * so those terms were corrected in place rather than versioned.
   */
  closedAmendmentId: string | null;
  openedAmendmentId: string | null;
};

/**
 * Versions the terms in force. The amendment that held the old price is closed
 * the day before the new one starts and a fresh open amendment carries the new
 * terms, so the detail page can still show what was paid, and when. A
 * `terms_changed` event records the move itself.
 */
export async function amendTerms(
  client: WriteClient,
  options: {
    before: SubscriptionRow;
    after: SubscriptionRow;
    effectiveFrom?: string;
    captureId?: string | null;
    rationale?: string | null;
    now: Date;
  },
): Promise<TermsChange> {
  const { after, before, now } = options;
  const effectiveFrom = options.effectiveFrom ?? today(now);
  const [open] = await client
    .select()
    .from(amendments)
    .where(
      and(
        eq(amendments.user_id, after.user_id),
        eq(amendments.subscription_id, after.id),
        isNull(amendments.effective_to),
      ),
    )
    .limit(1);

  let closedAmendmentId: string | null = null;
  let openedAmendmentId: string | null = null;

  if (open && effectiveFrom > open.effective_from) {
    await client
      .update(amendments)
      .set({ effective_to: addDays(effectiveFrom, -1), updated_at: now })
      .where(eq(amendments.id, open.id));

    const [opened] = await client
      .insert(amendments)
      .values({
        user_id: after.user_id,
        subscription_id: after.id,
        effective_from: effectiveFrom,
        effective_to: null,
        amount_minor: after.amount_minor,
        currency: after.currency,
        cadence: after.cadence,
        plan: after.plan,
      })
      .returning({ id: amendments.id });

    closedAmendmentId = open.id;
    openedAmendmentId = opened?.id ?? null;
  } else {
    await syncOpenAmendment(client, after, now);
    openedAmendmentId = open?.id ?? null;
  }

  await client.insert(events).values({
    user_id: after.user_id,
    subscription_id: after.id,
    type: "terms_changed",
    at: new Date(`${effectiveFrom}T00:00:00.000Z`),
    confirmed: true,
    rationale: options.rationale ?? null,
    payload: {
      effectiveFrom,
      from: termsOf(before),
      to: termsOf(after),
    },
    capture_id: options.captureId ?? null,
  });

  return { effectiveFrom, closedAmendmentId, openedAmendmentId };
}
