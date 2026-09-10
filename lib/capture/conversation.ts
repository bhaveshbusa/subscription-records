import { and, desc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { captureQuestions, captures, proposals, subscriptions } from "@/lib/db/schema";
import { toProposalView, type ProposalView } from "@/lib/proposals/projection";

import type { ChatCaptureResult } from "./record";
import { captureTargetFields, refineOneTarget, type CaptureTargetInput } from "./target-fields";

type ConversationClient = Pick<NodePgDatabase, "select">;

/** Enough turns to read a conversation about one record back; not an archive. */
export const MAX_CONVERSATION_TURNS = 40;

export const conversationQuerySchema = z
  .object(captureTargetFields)
  .strict()
  .superRefine(refineOneTarget);

export function parseConversationQuery(
  searchParams: URLSearchParams,
): { success: true; input: CaptureTargetInput } | { success: false; message: string } {
  const parsed = conversationQuerySchema.safeParse(
    Object.fromEntries(
      ["subscriptionId", "proposalId", "questionId"]
        .map((key) => [key, searchParams.get(key) ?? undefined])
        .filter(([, value]) => value !== undefined),
    ),
  );

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "invalid query" };
  }

  return { success: true, input: parsed.data };
}

/** A question as it was asked in a turn, with where it has got to since. */
export type ConversationQuestion = {
  id: string;
  reason: (typeof captureQuestions.$inferSelect)["reason"];
  state: (typeof captureQuestions.$inferSelect)["state"];
  provider: string;
  question: string;
  subscriptionId: string | null;
};

/**
 * One turn of the conversation, rebuilt from the rows it left behind: the
 * capture that was sent, the target it was sent against, and every proposal and
 * question it raised, each carrying its current state so applied, pending, and
 * rejected are told apart without a second ledger of results.
 */
export type ConversationTurn = {
  captureId: string;
  kind: (typeof captures.$inferSelect)["kind"];
  /** The message for text; the file name for uploads. */
  content: string | null;
  fileName: string | null;
  sentAt: string;
  target: {
    subscriptionId: string | null;
    proposalId: string | null;
    questionId: string | null;
  };
  proposals: ProposalView[];
  questions: ConversationQuestion[];
};

/**
 * The captures whose results concern the target even though they were sent
 * without naming it: the message that raised a card or asked a question is part
 * of the conversation about that card, question, or holding. User-scoped, so
 * a foreign id finds nothing.
 */
async function linkedCaptureIds(
  client: ConversationClient,
  userId: string,
  input: CaptureTargetInput,
): Promise<string[]> {
  const ids = new Set<string>();

  if (input.questionId || input.subscriptionId) {
    const rows = await client
      .select({ id: captureQuestions.capture_id })
      .from(captureQuestions)
      .where(
        and(
          eq(captureQuestions.user_id, userId),
          input.questionId
            ? eq(captureQuestions.id, input.questionId)
            : eq(captureQuestions.subscription_id, input.subscriptionId!),
        ),
      );

    for (const row of rows) {
      if (row.id) {
        ids.add(row.id);
      }
    }
  }

  if (input.proposalId || input.subscriptionId) {
    const rows = await client
      .select({ id: proposals.capture_id })
      .from(proposals)
      .where(
        and(
          eq(proposals.user_id, userId),
          input.proposalId
            ? eq(proposals.id, input.proposalId)
            : eq(proposals.subscription_id, input.subscriptionId!),
        ),
      );

    for (const row of rows) {
      if (row.id) {
        ids.add(row.id);
      }
    }
  }

  return [...ids];
}

async function turnFilter(
  client: ConversationClient,
  userId: string,
  input: CaptureTargetInput,
): Promise<SQL | undefined> {
  const named = input.questionId
    ? eq(captures.question_id, input.questionId)
    : input.proposalId
      ? eq(captures.proposal_id, input.proposalId)
      : input.subscriptionId
        ? eq(captures.subscription_id, input.subscriptionId)
        : null;

  if (!named) {
    return undefined;
  }

  const linked = await linkedCaptureIds(client, userId, input);

  return linked.length > 0 ? or(named, inArray(captures.id, linked)) : named;
}

/**
 * The conversation about a target, newest turn last. Every row is the session
 * user's: the target ids only narrow which of their own turns come back, so a
 * foreign id yields nothing rather than someone else's messages.
 */
export async function loadConversation(
  client: ConversationClient,
  options: { userId: string; target: CaptureTargetInput },
): Promise<ConversationTurn[]> {
  const scope = await turnFilter(client, options.userId, options.target);
  const rows = await client
    .select()
    .from(captures)
    .where(and(eq(captures.user_id, options.userId), scope))
    .orderBy(desc(captures.turn_seq))
    .limit(MAX_CONVERSATION_TURNS);

  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => row.id);
  const raised = await client
    .select({ row: proposals, provider: subscriptions.provider_display })
    .from(proposals)
    .leftJoin(subscriptions, eq(subscriptions.id, proposals.subscription_id))
    .where(and(eq(proposals.user_id, options.userId), inArray(proposals.capture_id, ids)))
    .orderBy(desc(proposals.created_at));
  const asked = await client
    .select()
    .from(captureQuestions)
    .where(
      and(eq(captureQuestions.user_id, options.userId), inArray(captureQuestions.capture_id, ids)),
    )
    .orderBy(desc(captureQuestions.asked_seq));

  return rows.reverse().map((row) => ({
    captureId: row.id,
    kind: row.kind,
    content: row.content,
    fileName: row.file_name,
    sentAt: row.created_at.toISOString(),
    target: {
      subscriptionId: row.subscription_id,
      proposalId: row.proposal_id,
      questionId: row.question_id,
    },
    proposals: raised
      .filter((entry) => entry.row.capture_id === row.id)
      .map((entry) => toProposalView(entry.row, entry.provider)),
    questions: asked
      .filter((question) => question.capture_id === row.id)
      .map((question) => ({
        id: question.id,
        reason: question.reason,
        state: question.state,
        provider: question.provider_display,
        question: question.question,
        subscriptionId: question.subscription_id,
      })),
  }));
}

/**
 * The turn a browser already sent under this attempt id, replayed from what it
 * left behind. A request that timed out on the way back is the same turn, not a
 * second message: nothing is read again and no second card is raised. This is
 * transport identity only — a genuinely repeated message under a fresh id still
 * goes through the semantic draft matching in `recordExtraction`.
 */
export async function replayTurn(
  client: ConversationClient,
  options: { userId: string; clientTurnId: string },
): Promise<ChatCaptureResult | null> {
  const [row] = await client
    .select({ id: captures.id })
    .from(captures)
    .where(
      and(
        eq(captures.user_id, options.userId),
        eq(captures.client_turn_id, options.clientTurnId),
        isNull(captures.storage_key),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const raised = await client
    .select({ row: proposals, provider: subscriptions.provider_display })
    .from(proposals)
    .leftJoin(subscriptions, eq(subscriptions.id, proposals.subscription_id))
    .where(and(eq(proposals.user_id, options.userId), eq(proposals.capture_id, row.id)))
    .orderBy(desc(proposals.created_at));
  const [question] = await client
    .select()
    .from(captureQuestions)
    .where(
      and(eq(captureQuestions.user_id, options.userId), eq(captureQuestions.capture_id, row.id)),
    )
    .orderBy(desc(captureQuestions.asked_seq))
    .limit(1);

  return {
    captureId: row.id,
    mode: null,
    notice: null,
    proposals: raised.map((entry) => toProposalView(entry.row, entry.provider)),
    matches: [],
    followUp: question
      ? {
          id: question.id,
          reason: question.reason,
          provider: question.provider_display,
          scope: question.scope_key,
          question: question.question,
        }
      : null,
    deferred: null,
  };
}
