/**
 * Capture no longer records payments. `applyChargeProposal` is unused by accept
 * of new captures; leftover `charged` cards are applied as terms in `decide.ts`.
 * The `charges` table stays until a later issue drops it.
 */
import { charges, events, proposals } from "@/lib/db/schema";
import { advanceByCadence } from "@/lib/subscriptions/dates";
import { formatMoneyMinor } from "@/lib/subscriptions/format";
import type { SubscriptionRow } from "@/lib/subscriptions/projection";
import type { WriteClient } from "@/lib/subscriptions/write";

import type { ProposalConflict } from "./apply";
import type { ProposalPayload } from "./payload";

type Charge = NonNullable<ProposalPayload["charge"]>;

/** The little a charge changes on the subscription row itself. */
type ChargeUpdate = {
  next_renewal?: string;
  renewal_field_status?: "inferred";
  amount_field_status?: "conflicted";
};

export type ChargeOutcome = {
  application: ChargeApplication;
  values: ChargeUpdate;
};

export type ChargeApplication = {
  /** False when this exact payment was already stored, so nothing was written. */
  recorded: boolean;
  chargeId: string | null;
  conflicts: ProposalConflict[];
  /** The `terms_changed` proposal raised when the payment disagrees on price. */
  termsChangedProposalId: string | null;
};

/**
 * The key a repeated report of the same payment produces, so the unique index
 * on `(user_id, idempotency_key)` collapses the second one. It is derived from
 * what the payment is rather than from the message, because the same payment
 * typed twice is still one payment.
 */
export function chatChargeKey(options: {
  subscriptionId: string;
  paidOn: string;
  amountMinor: number;
  currency: string;
}): string {
  return [
    "chat",
    options.subscriptionId,
    options.paidOn,
    options.amountMinor,
    options.currency,
  ].join(":");
}

/** The next billing day a cadence implies, or null when nothing implies one. */
function inferredRenewal(row: SubscriptionRow, paidOn: string): string | null {
  if (!row.cadence || row.renewal_field_status === "confirmed") {
    return null;
  }

  const next = advanceByCadence(paidOn, row.cadence);

  /** A renewal still in the future is a better answer than one derived here. */
  return row.next_renewal !== null && row.next_renewal > paidOn ? null : next;
}

/**
 * A payment against a subscription the ledger already has: a charge, a
 * `charged` event, and — only when the row does not already say otherwise — an
 * `inferred` next renewal. The amount paid never rewrites the recorded price:
 * a mismatch raises a `terms_changed` proposal for the person to decide, and
 * flags a confirmed price as `conflicted` rather than replacing it.
 */
export async function applyChargeProposal(
  client: WriteClient,
  options: {
    userId: string;
    subscription: SubscriptionRow;
    charge: Charge;
    captureId: string | null;
    rationale: string | null;
  },
): Promise<ChargeOutcome> {
  const { charge, subscription } = options;
  const [inserted] = await client
    .insert(charges)
    .values({
      user_id: options.userId,
      subscription_id: subscription.id,
      paid_on: charge.paidOn,
      amount_minor: charge.amountMinor,
      currency: charge.currency,
      capture_id: options.captureId,
      idempotency_key: charge.idempotencyKey,
    })
    .onConflictDoNothing({
      target: [charges.user_id, charges.idempotency_key],
    })
    .returning({ id: charges.id });

  if (!inserted) {
    return {
      application: {
        recorded: false,
        chargeId: null,
        conflicts: [],
        termsChangedProposalId: null,
      },
      values: {},
    };
  }

  await client.insert(events).values({
    user_id: options.userId,
    subscription_id: subscription.id,
    type: "charged",
    at: new Date(`${charge.paidOn}T00:00:00.000Z`),
    confirmed: true,
    rationale: options.rationale,
    payload: {
      chargeId: inserted.id,
      amountMinor: charge.amountMinor,
      currency: charge.currency,
    },
    capture_id: options.captureId,
  });

  const values: ChargeUpdate = {};
  const renewal = inferredRenewal(subscription, charge.paidOn);

  if (renewal) {
    values.next_renewal = renewal;
    values.renewal_field_status = "inferred";
  }

  const conflicts: ProposalConflict[] = [];
  let termsChangedProposalId: string | null = null;
  const differs =
    subscription.amount_minor !== null &&
    (subscription.amount_minor !== charge.amountMinor ||
      subscription.currency !== charge.currency);

  if (differs) {
    if (subscription.amount_field_status === "confirmed") {
      values.amount_field_status = "conflicted";
      conflicts.push("amount");
    }

    const [raised] = await client
      .insert(proposals)
      .values({
        user_id: options.userId,
        subscription_id: subscription.id,
        kind: "terms_changed",
        state: "pending",
        payload: {
          currency: charge.currency,
          amountMinor: { value: charge.amountMinor, status: "proposed" },
        } satisfies ProposalPayload,
        rationale: `Paid ${formatMoneyMinor(charge.amountMinor, charge.currency)} on ${charge.paidOn}, which is not the recorded price.`,
        confidence: "high",
        capture_id: options.captureId,
      })
      .returning({ id: proposals.id });

    termsChangedProposalId = raised?.id ?? null;
  }

  return {
    application: {
      recorded: true,
      chargeId: inserted.id,
      conflicts,
      termsChangedProposalId,
    },
    values,
  };
}
