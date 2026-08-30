import { and, eq } from "drizzle-orm";

import { isRecordId } from "@/lib/db/ids";
import { proposals, subscriptions } from "@/lib/db/schema";
import { syncOpenAmendment, type WriteClient } from "@/lib/subscriptions/write";

import {
  toProposedInsertValues,
  toProposedUpdateValues,
  toTermsChangedValues,
  type ProposalConflict,
} from "./apply";
import { applyChargeProposal, type ChargeApplication } from "./charge";
import type { ConfirmedTerms } from "./confirm";
import {
  applyLifecycleProposal,
  toLifecycleValues,
  type LifecycleApplication,
} from "./lifecycle";
import { isLifecycleKind, parseProposalPayload, type PayloadIssue } from "./payload";
import { isAppliableKind, type ProposalRow } from "./projection";
import {
  applyReactivationProposal,
  resumptionDate,
  toReactivationValues,
  type ReactivationApplication,
} from "./reactivate";
import { amendTerms, termsDiffer, termsOf, type TermsChange } from "./terms";

export type DecideError =
  | "not_found"
  | "not_pending"
  | "unsupported_kind"
  | "invalid_payload"
  | "subscription_not_found";

export type DecideResult =
  | {
      ok: true;
      proposal: ProposalRow;
      subscriptionId: string | null;
      conflicts: ProposalConflict[];
      /** Present for a `charged` proposal: what the payment did, or did not, add. */
      charge?: ChargeApplication;
      /** Present for a `terms_changed` proposal that moved the terms in force. */
      termsChange?: TermsChange;
      /** Present for a cancellation or lapse: when the subscription ends. */
      lifecycle?: LifecycleApplication;
      /** Present for a reactivation: when the subscription came back, and on what terms. */
      reactivation?: ReactivationApplication;
    }
  | { ok: false; error: DecideError; issues?: PayloadIssue[] };

/**
 * Locks the row for the rest of the transaction, so two clicks on Accept cannot
 * both apply the same proposal.
 */
async function claimPending(
  client: WriteClient,
  options: { userId: string; id: string },
): Promise<ProposalRow | "not_found" | "not_pending"> {
  if (!isRecordId(options.id)) {
    return "not_found";
  }

  const [row] = await client
    .select()
    .from(proposals)
    .where(and(eq(proposals.user_id, options.userId), eq(proposals.id, options.id)))
    .limit(1)
    .for("update");

  if (!row) {
    return "not_found";
  }

  return row.state === "pending" ? row : "not_pending";
}

async function settle(
  client: WriteClient,
  options: {
    id: string;
    userId: string;
    state: "accepted" | "rejected";
    subscriptionId?: string | null;
    now: Date;
  },
): Promise<ProposalRow> {
  const [row] = await client
    .update(proposals)
    .set({
      state: options.state,
      decided_at: options.now,
      updated_at: options.now,
      ...(options.subscriptionId === undefined
        ? {}
        : { subscription_id: options.subscriptionId }),
    })
    .where(and(eq(proposals.user_id, options.userId), eq(proposals.id, options.id)))
    .returning();

  return row;
}

/**
 * Applies the proposal and settles it in the caller's transaction, so a failure
 * anywhere leaves both the ledger and the proposal untouched.
 */
export async function acceptProposal(
  client: WriteClient,
  options: { userId: string; id: string; now?: Date; confirm?: ConfirmedTerms },
): Promise<DecideResult> {
  const now = options.now ?? new Date();
  const claimed = await claimPending(client, options);

  if (claimed === "not_found" || claimed === "not_pending") {
    return { ok: false, error: claimed };
  }

  if (!isAppliableKind(claimed.kind)) {
    return { ok: false, error: "unsupported_kind" };
  }

  const parsed = parseProposalPayload(claimed.kind, claimed.payload);

  if (!parsed.success) {
    return { ok: false, error: "invalid_payload", issues: parsed.issues };
  }

  if (claimed.kind === "create") {
    const [row] = await client
      .insert(subscriptions)
      .values(toProposedInsertValues(options.userId, parsed.payload, options.confirm))
      .returning();

    await syncOpenAmendment(client, row, now);

    const proposal = await settle(client, {
      ...options,
      state: "accepted",
      subscriptionId: row.id,
      now,
    });

    return { ok: true, proposal, subscriptionId: row.id, conflicts: [] };
  }

  if (!claimed.subscription_id) {
    return { ok: false, error: "subscription_not_found" };
  }

  const [current] = await client
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.user_id, options.userId),
        eq(subscriptions.id, claimed.subscription_id),
      ),
    )
    .limit(1)
    .for("update");

  if (!current) {
    return { ok: false, error: "subscription_not_found" };
  }

  if (claimed.kind === "charged") {
    const charge = parsed.payload.charge;

    if (!charge) {
      return {
        ok: false,
        error: "invalid_payload",
        issues: [{ field: "charge", message: "a charged proposal needs a charge" }],
      };
    }

    const outcome = await applyChargeProposal(client, {
      userId: options.userId,
      subscription: current,
      charge,
      captureId: claimed.capture_id,
      rationale: claimed.rationale,
    });
    const [row] = await client
      .update(subscriptions)
      .set({ ...outcome.values, updated_at: now })
      .where(
        and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, current.id)),
      )
      .returning();

    await syncOpenAmendment(client, row, now);

    const proposal = await settle(client, { ...options, state: "accepted", now });

    return {
      ok: true,
      proposal,
      subscriptionId: row.id,
      conflicts: outcome.application.conflicts,
      charge: outcome.application,
    };
  }

  /**
   * A subscription coming back is the same subscription: the row it already has
   * is revived, keeping its id and everything that happened to it, and the terms
   * it resumes on open an amendment of their own. A payment that came with it is
   * recorded against that same row, so paying twice still records one charge.
   */
  if (claimed.kind === "reactivated") {
    const resumedOn = resumptionDate(parsed.payload, now);
    const update = toReactivationValues(current, parsed.payload, now, options.confirm);
    const [revived] = await client
      .update(subscriptions)
      .set(update.values)
      .where(
        and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, current.id)),
      )
      .returning();
    const charge = parsed.payload.charge
      ? await applyChargeProposal(client, {
          userId: options.userId,
          subscription: revived,
          charge: parsed.payload.charge,
          captureId: claimed.capture_id,
          rationale: claimed.rationale,
        })
      : null;
    const [row] = charge
      ? await client
          .update(subscriptions)
          .set({ ...charge.values, updated_at: now })
          .where(
            and(
              eq(subscriptions.user_id, options.userId),
              eq(subscriptions.id, current.id),
            ),
          )
          .returning()
      : [revived];
    const reactivation = await applyReactivationProposal(client, {
      subscription: row,
      resumedOn,
      captureId: claimed.capture_id,
      rationale: claimed.rationale,
      now,
    });
    const proposal = await settle(client, { ...options, state: "accepted", now });

    return {
      ok: true,
      proposal,
      subscriptionId: row.id,
      conflicts: [...update.conflicts, ...(charge?.application.conflicts ?? [])],
      reactivation,
      ...(charge ? { charge: charge.application } : {}),
    };
  }

  /**
   * An ending keeps the row and its terms: the subscription is the same one, so
   * only its status and dates move, and its history gains the event.
   */
  if (isLifecycleKind(claimed.kind)) {
    const { values, endsOn, stillBilling } = toLifecycleValues(
      claimed.kind,
      parsed.payload,
      current,
      now,
    );
    await client
      .update(subscriptions)
      .set(values)
      .where(
        and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, current.id)),
      );
    const lifecycle = await applyLifecycleProposal(client, {
      kind: claimed.kind,
      subscription: current,
      endsOn,
      stillBilling,
      captureId: claimed.capture_id,
      rationale: claimed.rationale,
      now,
    });
    const proposal = await settle(client, { ...options, state: "accepted", now });

    return { ok: true, proposal, subscriptionId: current.id, conflicts: [], lifecycle };
  }

  const update =
    claimed.kind === "terms_changed"
      ? toTermsChangedValues(current, parsed.payload, now, options.confirm)
      : toProposedUpdateValues(current, parsed.payload, now, options.confirm);
  const [row] = await client
    .update(subscriptions)
    .set(update.values)
    .where(
      and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, current.id)),
    )
    .returning();

  /** Only a change of terms versions the amendment; an update just follows the row. */
  let termsChange: TermsChange | undefined;

  if (claimed.kind === "terms_changed" && termsDiffer(termsOf(current), termsOf(row))) {
    termsChange = await amendTerms(client, {
      before: current,
      after: row,
      effectiveFrom: parsed.payload.effectiveFrom,
      captureId: claimed.capture_id,
      rationale: claimed.rationale,
      now,
    });
  } else {
    await syncOpenAmendment(client, row, now);
  }

  const proposal = await settle(client, { ...options, state: "accepted", now });

  return {
    ok: true,
    proposal,
    subscriptionId: row.id,
    conflicts: update.conflicts,
    ...(termsChange ? { termsChange } : {}),
  };
}

/** Rejecting records the decision and writes nothing to the ledger. */
export async function rejectProposal(
  client: WriteClient,
  options: { userId: string; id: string; now?: Date },
): Promise<DecideResult> {
  const now = options.now ?? new Date();
  const claimed = await claimPending(client, options);

  if (claimed === "not_found" || claimed === "not_pending") {
    return { ok: false, error: claimed };
  }

  const proposal = await settle(client, { ...options, state: "rejected", now });

  return { ok: true, proposal, subscriptionId: proposal.subscription_id, conflicts: [] };
}
