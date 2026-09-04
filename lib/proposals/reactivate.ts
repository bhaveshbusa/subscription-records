import { and, eq, isNull } from "drizzle-orm";

import { amendments, events } from "@/lib/db/schema";
import { addDays } from "@/lib/subscriptions/dates";
import type { SubscriptionRow } from "@/lib/subscriptions/projection";
import { today } from "@/lib/subscriptions/query";
import type { WriteClient } from "@/lib/subscriptions/write";

import { toProposedUpdateValues, type ProposedUpdate } from "./apply";
import type { ConfirmedTerms } from "./confirm";
import type { ProposalPayload } from "./payload";
import { termsOf } from "./terms";

export type ReactivationApplication = {
  /** The day the subscription is running again from. */
  resumedOn: string;
  /** The amendment that held the terms it stopped on, if one was still open. */
  closedAmendmentId: string | null;
  /** The amendment carrying the terms it comes back on. */
  openedAmendmentId: string | null;
};

/** The day the subscription is on again from: the stated resume day, or the decision. */
export function resumptionDate(payload: ProposalPayload, now: Date): string {
  return payload.effectiveFrom ?? payload.charge?.paidOn ?? today(now);
}

/**
 * The row a reactivation leaves behind. It is the same subscription — same id,
 * same provider, same history — so only what stopped it moves: the status comes
 * back to running and the end date goes, because there is no longer an end.
 *
 * Whatever else the message brought is applied as it would be on any update, so
 * a new price still lands `proposed` and still yields to a confirmed one. The
 * status itself is set outright rather than resolved against the confirmed
 * `cancelled` it replaces: accepting the card is the user saying it is back on,
 * which is the same authority that confirmed the cancellation.
 */
export function toReactivationValues(
  row: SubscriptionRow,
  payload: ProposalPayload,
  now: Date,
  confirm?: ConfirmedTerms,
): ProposedUpdate {
  const { subscriptionStatus, ...rest } = payload;
  const update = toProposedUpdateValues(row, rest, now, confirm);

  return {
    ...update,
    values: {
      ...update.values,
      status: subscriptionStatus?.value ?? "active",
      status_field_status: "confirmed",
      status_confidence: null,
      ends_on: null,
    },
  };
}

/**
 * Records the restart on the subscription's own history. The terms it stopped on
 * stay where they are, closed the day before it resumed, and the terms it comes
 * back on open a new amendment: what it used to cost is still readable on the
 * detail page, and the two are not confused for one another.
 */
export async function applyReactivationProposal(
  client: WriteClient,
  options: {
    subscription: SubscriptionRow;
    resumedOn: string;
    captureId?: string | null;
    rationale?: string | null;
    now: Date;
  },
): Promise<ReactivationApplication> {
  const { now, resumedOn, subscription } = options;
  const [open] = await client
    .select()
    .from(amendments)
    .where(
      and(
        eq(amendments.user_id, subscription.user_id),
        eq(amendments.subscription_id, subscription.id),
        isNull(amendments.effective_to),
      ),
    )
    .limit(1);

  let closedAmendmentId: string | null = null;

  /**
   * A cancellation that ran to the end of the period left its amendment open,
   * because those terms were still being paid. They stop where the new ones
   * start — unless that is the day they began, which leaves nothing to keep.
   */
  if (open && resumedOn > open.effective_from) {
    await client
      .update(amendments)
      .set({ effective_to: addDays(resumedOn, -1), updated_at: now })
      .where(eq(amendments.id, open.id));

    closedAmendmentId = open.id;
  }

  const [opened] =
    open && closedAmendmentId === null
      ? await client
          .update(amendments)
          .set({
            amount_minor: subscription.amount_minor,
            currency: subscription.currency,
            cadence: subscription.cadence,
            plan: subscription.plan,
            updated_at: now,
          })
          .where(eq(amendments.id, open.id))
          .returning({ id: amendments.id })
      : await client
          .insert(amendments)
          .values({
            user_id: subscription.user_id,
            subscription_id: subscription.id,
            effective_from: resumedOn,
            effective_to: null,
            amount_minor: subscription.amount_minor,
            currency: subscription.currency,
            cadence: subscription.cadence,
            plan: subscription.plan,
          })
          .returning({ id: amendments.id });

  await client.insert(events).values({
    user_id: subscription.user_id,
    subscription_id: subscription.id,
    type: "reactivated",
    at: new Date(`${resumedOn}T00:00:00.000Z`),
    confirmed: true,
    rationale: options.rationale ?? null,
    payload: { resumedOn, terms: termsOf(subscription) },
    capture_id: options.captureId ?? null,
  });

  return { resumedOn, closedAmendmentId, openedAmendmentId: opened?.id ?? null };
}
