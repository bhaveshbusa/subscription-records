import { and, eq, isNull, type InferInsertModel } from "drizzle-orm";

import { amendments, events, subscriptions } from "@/lib/db/schema";
import type { SubscriptionRow } from "@/lib/subscriptions/projection";
import { today } from "@/lib/subscriptions/query";
import type { WriteClient } from "@/lib/subscriptions/write";

import type { LifecycleProposalKind, ProposalPayload } from "./payload";

type SubscriptionUpdate = Partial<InferInsertModel<typeof subscriptions>> & {
  updated_at: Date;
};

export type LifecycleApplication = {
  status: LifecycleProposalKind;
  /** The day the subscription stops, or stopped. */
  endsOn: string;
  /** Whether the subscription still bills until `endsOn`. */
  stillBilling: boolean;
  /** The amendment the ending closed, or null when none was open. */
  closedAmendmentId: string | null;
};

/**
 * The day the subscription ends. A cancellation that runs on ends when the
 * period already paid for does, which is the renewal that will no longer happen;
 * one that has already stopped ends the day it was accepted.
 */
function endDate(
  kind: LifecycleProposalKind,
  payload: ProposalPayload,
  row: SubscriptionRow,
  now: Date,
): string {
  if (payload.endsOn) {
    return payload.endsOn;
  }

  return kind === "cancel_scheduled" ? (row.next_renewal ?? today(now)) : today(now);
}

/**
 * The row an accepted ending leaves behind. The subscription keeps its id, its
 * provider, and its terms — it is the same subscription, now over — so only the
 * status and the dates move. Accepting is the user's own decision about their
 * own ledger, so the status lands `confirmed` rather than `proposed`.
 *
 * A subscription that has stopped has nothing left to renew, so its renewal date
 * is cleared. One that runs to the end of the period keeps it: that renewal is
 * still what the end date means, and the row still counts towards the monthly
 * total until then.
 */
export function toLifecycleValues(
  kind: LifecycleProposalKind,
  payload: ProposalPayload,
  row: SubscriptionRow,
  now: Date,
): { values: SubscriptionUpdate; endsOn: string; stillBilling: boolean } {
  const endsOn = endDate(kind, payload, row, now);
  const stillBilling = kind === "cancel_scheduled";
  const values: SubscriptionUpdate = {
    status: kind,
    status_field_status: "confirmed",
    status_confidence: null,
    ends_on: endsOn,
    updated_at: now,
  };

  if (!stillBilling) {
    values.next_renewal = null;
    values.renewal_field_status = "empty";
    values.renewal_confidence = null;
  }

  return { values, endsOn, stillBilling };
}

/**
 * Records the ending on the subscription's history: an event of the kind that was
 * accepted, and — once the subscription has actually stopped — the close of the
 * amendment that held the terms it was paying. A scheduled cancellation leaves
 * the amendment open, because those terms are still in force until the end date.
 */
export async function applyLifecycleProposal(
  client: WriteClient,
  options: {
    kind: LifecycleProposalKind;
    subscription: SubscriptionRow;
    endsOn: string;
    stillBilling: boolean;
    captureId?: string | null;
    rationale?: string | null;
    now: Date;
  },
): Promise<LifecycleApplication> {
  const { endsOn, kind, stillBilling, subscription } = options;
  let closedAmendmentId: string | null = null;

  if (!stillBilling) {
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

    if (open) {
      await client
        .update(amendments)
        .set({
          /** Never before the day those terms started, however the end is dated. */
          effective_to: endsOn < open.effective_from ? open.effective_from : endsOn,
          updated_at: options.now,
        })
        .where(eq(amendments.id, open.id));

      closedAmendmentId = open.id;
    }
  }

  await client.insert(events).values({
    user_id: subscription.user_id,
    subscription_id: subscription.id,
    type: kind,
    /** A scheduled cancellation happened when it was accepted, not when it lands. */
    at: stillBilling ? options.now : new Date(`${endsOn}T00:00:00.000Z`),
    confirmed: true,
    rationale: options.rationale ?? null,
    payload: { endsOn },
    capture_id: options.captureId ?? null,
  });

  return { status: kind, endsOn, stillBilling, closedAmendmentId };
}
