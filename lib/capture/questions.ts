import { and, desc, eq, inArray, type InferSelectModel } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { captureQuestions, subscriptions } from "@/lib/db/schema";
import { canonicalProvider } from "@/lib/subscriptions/write";

import {
  extractionCandidateSchema,
  type ExtractionCandidate,
} from "./candidates";
import { questionKey, type FollowUp, type FollowUpReason } from "./follow-up";

export type QuestionClient = Pick<NodePgDatabase, "select" | "insert" | "update">;

export type QuestionRow = InferSelectModel<typeof captureQuestions>;

/** The ledger column a question is about, so putting it off is visible there. */
function deferrableField(reason: FollowUpReason) {
  switch (reason) {
    case "amount":
      return {
        column: subscriptions.amount_field_status,
        values: { amount_field_status: "deferred" as const },
      };
    case "cadence":
      return {
        column: subscriptions.cadence_field_status,
        values: { cadence_field_status: "deferred" as const },
      };
    case "renewal":
      return {
        column: subscriptions.renewal_field_status,
        values: { renewal_field_status: "deferred" as const },
      };
    case "duplicate":
    case "cancel_timing":
    case "account_identity":
      return null;
  }
}

/**
 * The reading the question was asked about, validated on the way out: a row
 * written by an earlier version carries none, and a hand-edited one may carry
 * something that is no longer a candidate.
 */
export function questionCandidate(row: QuestionRow): ExtractionCandidate | null {
  const parsed = extractionCandidateSchema.safeParse(row.candidate);

  return parsed.success ? parsed.data : null;
}

export function rowKey(row: Pick<QuestionRow, "reason" | "provider_canonical">): string {
  return `${row.reason}:${row.provider_canonical}`;
}

/** Every question still hanging over the conversation: asked, or put off. */
export async function loadOpenQuestions(
  client: QuestionClient,
  userId: string,
): Promise<QuestionRow[]> {
  return client
    .select()
    .from(captureQuestions)
    .where(
      and(
        eq(captureQuestions.user_id, userId),
        inArray(captureQuestions.state, ["asked", "deferred"]),
      ),
    );
}

/** The question a bare "later" is about: the most recent one still unanswered. */
export async function latestAskedQuestion(
  client: QuestionClient,
  userId: string,
): Promise<QuestionRow | null> {
  const [row] = await client
    .select()
    .from(captureQuestions)
    .where(
      and(eq(captureQuestions.user_id, userId), eq(captureQuestions.state, "asked")),
    )
    .orderBy(desc(captureQuestions.updated_at), desc(captureQuestions.asked_seq))
    .limit(1);

  return row ?? null;
}

export async function recordQuestion(
  client: QuestionClient,
  options: {
    userId: string;
    captureId: string;
    followUp: FollowUp;
    subscriptionId: string | null;
    /** What the message read, so an answer can be acted on without it. */
    candidate?: ExtractionCandidate | null;
    now: Date;
  },
): Promise<void> {
  const values = {
    user_id: options.userId,
    capture_id: options.captureId,
    subscription_id: options.subscriptionId,
    provider_canonical: canonicalProvider(options.followUp.provider),
    provider_display: options.followUp.provider,
    reason: options.followUp.reason,
    state: "asked" as const,
    question: options.followUp.question,
    candidate: options.candidate ?? null,
    updated_at: options.now,
  };

  await client
    .insert(captureQuestions)
    .values(values)
    .onConflictDoUpdate({
      target: [
        captureQuestions.user_id,
        captureQuestions.provider_canonical,
        captureQuestions.reason,
      ],
      set: {
        capture_id: values.capture_id,
        subscription_id: values.subscription_id,
        provider_display: values.provider_display,
        question: values.question,
        candidate: values.candidate,
        state: "asked",
        resolved_at: null,
        updated_at: options.now,
      },
    });
}

/**
 * An answer closes the question, including one that was put off: the user
 * brought the number up again, so the subject is open once more.
 */
export async function answerQuestions(
  client: QuestionClient,
  options: { userId: string; answered: { reason: FollowUpReason; provider: string }[]; now: Date },
): Promise<void> {
  const keys = new Set(
    options.answered.map((entry) => questionKey(entry.reason, entry.provider)),
  );

  if (keys.size === 0) {
    return;
  }

  const open = await loadOpenQuestions(client, options.userId);
  const ids = open.filter((row) => keys.has(rowKey(row))).map((row) => row.id);

  if (ids.length === 0) {
    return;
  }

  await client
    .update(captureQuestions)
    .set({ state: "answered", resolved_at: options.now, updated_at: options.now })
    .where(
      and(eq(captureQuestions.user_id, options.userId), inArray(captureQuestions.id, ids)),
    );
}

/**
 * "Later" is an answer of its own. The question stops being asked, and when it
 * was about a row in the ledger, that field reads `deferred` rather than empty.
 */
export async function deferQuestion(
  client: QuestionClient,
  options: { userId: string; question: QuestionRow; now: Date },
): Promise<void> {
  await client
    .update(captureQuestions)
    .set({ state: "deferred", resolved_at: options.now, updated_at: options.now })
    .where(
      and(
        eq(captureQuestions.user_id, options.userId),
        eq(captureQuestions.id, options.question.id),
      ),
    );

  const subscriptionId = options.question.subscription_id;
  const field = deferrableField(options.question.reason);

  if (!subscriptionId || !field) {
    return;
  }

  await client
    .update(subscriptions)
    .set({ ...field.values, updated_at: options.now })
    .where(
      and(
        eq(subscriptions.user_id, options.userId),
        eq(subscriptions.id, subscriptionId),
        eq(field.column, "empty"),
      ),
    );
}
