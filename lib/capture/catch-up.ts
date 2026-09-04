import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";

import { captureQuestions, subscriptions } from "@/lib/db/schema";
import { calendarToday } from "@/lib/subscriptions/dates";
import { HOLDING_STATUSES } from "@/lib/subscriptions/params";

import type { FollowUp } from "./follow-up";
import {
  latestAskedQuestion,
  recordQuestion,
  type QuestionClient,
  type QuestionRow,
} from "./questions";

/** One catch-up row per user, not per provider. */
export const STILL_HOLDING_PROVIDER = "these subscriptions";

export type StillHoldingAnswer = "yes" | "no";

const YES_PATTERN =
  /^(yes|yeah|yep|yup|still|i (?:still )?do|i (?:still )?(?:have|hold) (?:them|those|it|all)|still (?:have|holding|got)(?: them| those| it)?|all of them)[.!?]?$/i;

const NO_PATTERN =
  /^(no|nope|nah|not anymore|none(?: of them)?|i (?:don't|do not|dont)(?: still)?(?: have| hold)?(?: them| those| it)?)[.!?]?$/i;

export function joinProviderNames(names: string[]): string {
  if (names.length === 0) {
    return "";
  }

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

export function stillHoldingQuestion(providers: string[]): FollowUp {
  return {
    reason: "still_holding",
    provider: STILL_HOLDING_PROVIDER,
    question: `Are you still holding ${joinProviderNames(providers)}?`,
  };
}

/**
 * A bare yes or no to the catch-up. Anything that names a subscription goes to
 * the extractor instead, so "I cancelled Headspace" is not read as "no".
 */
export function readStillHoldingReply(text: string): StillHoldingAnswer | null {
  const trimmed = text.trim();

  if (YES_PATTERN.test(trimmed)) {
    return "yes";
  }

  if (NO_PATTERN.test(trimmed)) {
    return "no";
  }

  return null;
}

export async function staleHoldingProviders(
  client: QuestionClient,
  options: { userId: string; now?: Date },
): Promise<{ id: string; provider: string }[]> {
  const on = calendarToday(options.now ?? new Date());
  const rows = await client
    .select({
      id: subscriptions.id,
      provider: subscriptions.provider_display,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.user_id, options.userId),
        inArray(subscriptions.status, [...HOLDING_STATUSES]),
        isNotNull(subscriptions.next_renewal),
        lt(subscriptions.next_renewal, on),
      ),
    )
    .orderBy(subscriptions.provider_display);

  return rows;
}

function toFollowUp(row: QuestionRow): FollowUp {
  return {
    reason: "still_holding",
    provider: row.provider_display,
    question: row.question,
  };
}

/**
 * One still-holding question when due dates on holding rows are in the past.
 * Skip when that question was already asked, answered, or deferred.
 */
export async function ensureStillHoldingQuestion(
  client: QuestionClient,
  options: { userId: string; captureId?: string | null; now?: Date },
): Promise<FollowUp | null> {
  const now = options.now ?? new Date();
  const existing = await client
    .select()
    .from(captureQuestions)
    .where(
      and(
        eq(captureQuestions.user_id, options.userId),
        eq(captureQuestions.reason, "still_holding"),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return existing[0].state === "asked" ? toFollowUp(existing[0]) : null;
  }

  const stale = await staleHoldingProviders(client, { userId: options.userId, now });

  if (stale.length === 0) {
    return null;
  }

  const followUp = stillHoldingQuestion(stale.map((row) => row.provider));

  await recordQuestion(client, {
    userId: options.userId,
    captureId: options.captureId ?? null,
    followUp,
    subscriptionId: stale.length === 1 ? stale[0].id : null,
    now,
  });

  return followUp;
}

export async function askedStillHolding(
  client: QuestionClient,
  userId: string,
): Promise<FollowUp | null> {
  const asked = await latestAskedQuestion(client, userId);

  return asked?.reason === "still_holding" ? toFollowUp(asked) : null;
}
