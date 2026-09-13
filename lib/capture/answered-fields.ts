import { and, eq, inArray } from "drizzle-orm";

import { captureQuestions } from "@/lib/db/schema";
import type { FieldStatus, SubscriptionRow } from "@/lib/subscriptions/projection";

import { holdingScope, type FollowUpReason } from "./follow-up";
import { loadOpenQuestions, type QuestionClient } from "./questions";

/**
 * A question asks for a term the row lacks; once the row records it — by hand
 * or by an accepted card — that question is answered. A `conflicted` field is
 * a disagreement still to settle, not an answer. Questions about other fields
 * or other holdings, and every field's trust, are left as they are.
 */
const RECORDED: readonly FieldStatus[] = ["proposed", "inferred", "confirmed"];

type FieldQuestion = Extract<FollowUpReason, "amount" | "cadence" | "renewal">;

type RecordedFields = Pick<
  SubscriptionRow,
  | "id"
  | "amount_minor"
  | "cadence"
  | "next_renewal"
  | "amount_field_status"
  | "cadence_field_status"
  | "renewal_field_status"
>;

function recordedFieldQuestions(row: RecordedFields): FieldQuestion[] {
  const recorded: FieldQuestion[] = [];

  if (row.amount_minor !== null && RECORDED.includes(row.amount_field_status)) {
    recorded.push("amount");
  }

  if (row.cadence !== null && RECORDED.includes(row.cadence_field_status)) {
    recorded.push("cadence");
  }

  if (row.next_renewal !== null && RECORDED.includes(row.renewal_field_status)) {
    recorded.push("renewal");
  }

  return recorded;
}

/** Closes the open questions about this holding whose field the row now records. Returns the ids closed. */
export async function resolveRecordedFieldQuestions(
  client: QuestionClient,
  options: { userId: string; row: RecordedFields; now: Date },
): Promise<string[]> {
  const recorded = new Set<FollowUpReason>(recordedFieldQuestions(options.row));

  if (recorded.size === 0) {
    return [];
  }

  const scope = holdingScope(options.row.id);
  const open = await loadOpenQuestions(client, options.userId);
  const ids = open
    .filter(
      (row) =>
        (row.scope_key === scope || row.subscription_id === options.row.id) &&
        recorded.has(row.reason),
    )
    .map((row) => row.id);

  if (ids.length === 0) {
    return [];
  }

  await client
    .update(captureQuestions)
    .set({ state: "answered", resolved_at: options.now, updated_at: options.now })
    .where(
      and(eq(captureQuestions.user_id, options.userId), inArray(captureQuestions.id, ids)),
    );

  return ids;
}
