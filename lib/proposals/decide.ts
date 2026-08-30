import { and, eq } from "drizzle-orm";

import { isRecordId } from "@/lib/db/ids";
import { proposals, subscriptions } from "@/lib/db/schema";
import { syncOpenAmendment, type WriteClient } from "@/lib/subscriptions/write";

import {
  toProposedInsertValues,
  toProposedUpdateValues,
  type ProposalConflict,
} from "./apply";
import type { ConfirmedTerms } from "./confirm";
import { parseProposalPayload, type PayloadIssue } from "./payload";
import { isAppliableKind, type ProposalRow } from "./projection";

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

  const update = toProposedUpdateValues(current, parsed.payload, now, options.confirm);
  const [row] = await client
    .update(subscriptions)
    .set(update.values)
    .where(
      and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, current.id)),
    )
    .returning();

  await syncOpenAmendment(client, row, now);

  const proposal = await settle(client, { ...options, state: "accepted", now });

  return { ok: true, proposal, subscriptionId: row.id, conflicts: update.conflicts };
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
