import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { isRecordId } from "@/lib/db/ids";
import { subscriptions } from "@/lib/db/schema";
import type { SubscriptionRow } from "@/lib/subscriptions/projection";
import type { WriteClient } from "@/lib/subscriptions/write";

/**
 * What a row whose status the ledger could not read can be set to. Ending a
 * subscription is a lifecycle change with its own timing, so it is not here:
 * that is the Overdue **Cancelled** action, which asks when it stopped.
 */
export const UNRESOLVED_STATUSES = ["active", "trial", "paused"] as const;

export type UnresolvedStatus = (typeof UNRESOLVED_STATUSES)[number];

export const unresolvedStatusBodySchema = z
  .object({ status: z.enum(UNRESOLVED_STATUSES) })
  .strict();

export type UnresolvedFailure = "not_found" | "already_resolved";

export type UnresolvedOutcome =
  | {
      ok: true;
      action: "status_set";
      subscriptionId: string;
      provider: string;
      status: UnresolvedStatus;
    }
  | { ok: false; error: UnresolvedFailure };

/**
 * Says what the row is, and nothing else. A subscription that landed `unknown`
 * — an older capture, or input the reader could not settle — needs one answer:
 * whether the person has it. Answering it must not touch the money or the dates,
 * which is why this is not **Still have it**: that action rolls the recorded
 * renewal date, and a row nobody has said is active has no schedule to roll.
 *
 * The status lands `confirmed`. The person clicking is the only one who knows,
 * and this is their own ledger.
 * [SUB-60](https://linear.app/lets-play-match/issue/SUB-60/interpret-new-subscriptions-as-active-and-current-trials-as-trial)
 */
export async function setUnresolvedStatus(
  client: WriteClient,
  options: {
    userId: string;
    id: string;
    status: UnresolvedStatus;
    now?: Date;
  },
): Promise<UnresolvedOutcome> {
  if (!isRecordId(options.id)) {
    return { ok: false, error: "not_found" };
  }

  const [row] = (await client
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, options.id)),
    )
    .limit(1)) as SubscriptionRow[];

  if (!row) {
    return { ok: false, error: "not_found" };
  }

  /**
   * Only a row nobody has read yet. A second click after the first one landed,
   * or an attempt to reword a status somebody already settled, is refused rather
   * than allowed to overwrite an answer that is already there.
   */
  if (row.status !== "unknown") {
    return { ok: false, error: "already_resolved" };
  }

  await client
    .update(subscriptions)
    .set({
      status: options.status,
      status_field_status: "confirmed",
      status_confidence: null,
      updated_at: options.now ?? new Date(),
    })
    .where(
      and(eq(subscriptions.user_id, options.userId), eq(subscriptions.id, options.id)),
    );

  return {
    ok: true,
    action: "status_set",
    subscriptionId: row.id,
    provider: row.provider_display,
    status: options.status,
  };
}
