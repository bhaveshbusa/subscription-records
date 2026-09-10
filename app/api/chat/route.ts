import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { isDeferral } from "@/lib/capture/defer";
import {
  extractCandidates,
  ExtractionReadError,
  ExtractorUnavailableError,
} from "@/lib/capture/extract";
import { readCancelTimingReply } from "@/lib/capture/lifecycle";
import { parseChatMessageBody } from "@/lib/capture/message";
import { latestAskedQuestion } from "@/lib/capture/questions";
import { readIdentityReply } from "@/lib/capture/reactivation";
import {
  recordCancelTimingAnswer,
  recordChatCapture,
  recordChatDeferral,
  identityChoices,
  recordIdentityAnswer,
} from "@/lib/capture/record";
import {
  duplicateChoices,
  recordDuplicateAnswer,
} from "@/lib/proposals/retarget";
import { getDb } from "@/lib/db";
import { readJsonBody } from "@/lib/subscriptions/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!sessionUser.userId) {
    return NextResponse.json({ error: "no_user_record" }, { status: 403 });
  }

  const parsed = parseChatMessageBody(await readJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.issues },
      { status: 400 },
    );
  }

  const text = parsed.input.message;
  const userId = sessionUser.userId;
  const db = getDb();
  /**
   * "I'll tell you the price later" answers the open question rather than
   * describing a subscription, so it is recorded without running an extractor.
   */
  const pending = isDeferral(text) ? await latestAskedQuestion(db, userId) : null;

  if (pending) {
    const deferral = await db.transaction((tx) =>
      recordChatDeferral(tx, { userId, text, question: pending }),
    );

    return NextResponse.json(deferral, { status: 201 });
  }

  /**
   * "Three months ago", "straight away", or "at the end of the month" answers
   * an open cancellation question, and names no subscription of its own, so the
   * row it is about comes from the question rather than from an extractor.
   */
  const asked = await latestAskedQuestion(db, userId);
  const timing =
    asked?.reason === "cancel_timing"
      ? readCancelTimingReply(text, asked.provider_display)
      : null;

  if (asked && timing) {
    const answered = await db.transaction((tx) =>
      recordCancelTimingAnswer(tx, { userId, text, question: asked, timing }),
    );

    return NextResponse.json(answered, { status: 201 });
  }

  /**
   * "Same one", "the family one", or "no, that's a new account" answers an open
   * identity question about which holding a message meant, so the reading it was
   * asked about comes from the question rather than from this message.
   */
  const identity =
    asked?.reason === "account_identity"
      ? readIdentityReply(
          text,
          asked.provider_display,
          await identityChoices(db, userId, asked),
        )
      : null;

  if (asked && identity) {
    const answered = await db.transaction((tx) =>
      recordIdentityAnswer(tx, { userId, text, question: asked, identity }),
    );

    return NextResponse.json(answered, { status: 201 });
  }

  /**
   * "Yes, that's the same one" or "no, a new one" answers an open duplicate
   * question: the pending draft is retargeted at the holding it named, or left
   * as a holding of its own.
   */
  const duplicate =
    asked?.reason === "duplicate"
      ? readIdentityReply(
          text,
          asked.provider_display,
          await duplicateChoices(db, userId, asked),
        )
      : null;

  if (asked && duplicate) {
    const answered = await db.transaction((tx) =>
      recordDuplicateAnswer(tx, { userId, text, question: asked, identity: duplicate }),
    );

    return NextResponse.json(answered, { status: 201 });
  }

  let extraction;

  try {
    extraction = await extractCandidates(text);
  } catch (error) {
    if (error instanceof ExtractorUnavailableError) {
      return NextResponse.json(
        { error: "extractor_unavailable", message: error.message },
        { status: 503 },
      );
    }

    /**
     * A reading that failed for a reason the sender can do something about - the
     * list was too long, the reply came back unreadable - says so in its own
     * words, and `reason` tells the composer to show them rather than dress them
     * up as a technical failure.
     */
    return NextResponse.json(
      {
        error: "extraction_failed",
        reason: error instanceof ExtractionReadError ? error.reason : null,
        message: error instanceof Error ? error.message : "extraction failed",
      },
      { status: 502 },
    );
  }

  /** One transaction, so a message never lands without its proposals. */
  const result = await db.transaction((tx) =>
    recordChatCapture(tx, { userId, text, extraction }),
  );

  return NextResponse.json(result, { status: 201 });
}
