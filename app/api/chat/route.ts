import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { isDeferral } from "@/lib/capture/defer";
import {
  extractCandidates,
  ExtractionReadError,
  ExtractorUnavailableError,
} from "@/lib/capture/extract";
import { replayTurn } from "@/lib/capture/conversation";
import { readCancelTimingReply } from "@/lib/capture/lifecycle";
import { parseChatMessageBody } from "@/lib/capture/message";
import { contextualizeReply } from "@/lib/capture/question-reply";
import {
  latestAskedQuestion,
  loadOpenQuestions,
  type QuestionRow,
} from "@/lib/capture/questions";
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
import {
  applyTargetContext,
  pinnedSubscriptionId,
  resolveCaptureTarget,
  targetColumns,
  targetProviderDisplay,
  targetQuestion,
} from "@/lib/capture/target";
import { getDb } from "@/lib/db";
import { readJsonBody } from "@/lib/subscriptions/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function askedOnly(rows: QuestionRow[]): QuestionRow[] {
  return rows.filter((row) => row.state === "asked");
}

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
  const { clientTurnId } = parsed.input;
  const userId = sessionUser.userId;
  const db = getDb();

  /** The same attempt again is answered from what it already did, before anything is re-read. */
  if (clientTurnId) {
    const replayed = await replayTurn(db, { userId, clientTurnId });

    if (replayed) {
      return NextResponse.json(replayed, { status: 200 });
    }
  }

  const resolved = await resolveCaptureTarget(db, userId, parsed.input);

  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.failure.error, message: resolved.failure.message },
      { status: resolved.failure.status },
    );
  }

  const { target } = resolved;
  const question = targetQuestion(target);
  const context = { ...targetColumns(target), client_turn_id: clientTurnId ?? null };

  /**
   * "I'll tell you the price later" answers the selected question rather than
   * describing a subscription, so it is recorded without running an extractor.
   * Several open questions cannot share a bare "later": name the one.
   */
  if (isDeferral(text)) {
    let pending = question;

    if (!pending) {
      const asked = askedOnly(await loadOpenQuestions(db, userId));

      if (asked.length > 1) {
        return NextResponse.json(
          {
            error: "question_required",
            message: "Choose which question to put off. Several are still open.",
          },
          { status: 409 },
        );
      }

      pending = asked[0] ?? (await latestAskedQuestion(db, userId));
    }

    if (pending) {
      const deferral = await db.transaction((tx) =>
        recordChatDeferral(tx, { userId, text, question: pending, context }),
      );

      return NextResponse.json(deferral, { status: 201 });
    }
  }

  /**
   * "Three months ago", "straight away", or "at the end of the month" answers
   * an open cancellation question, and names no subscription of its own, so the
   * row it is about comes from the question rather than from an extractor.
   */
  const asked =
    question ?? (target.kind === "all" ? await latestAskedQuestion(db, userId) : null);
  const timing =
    asked?.reason === "cancel_timing"
      ? readCancelTimingReply(text, asked.provider_display)
      : null;

  if (asked && timing) {
    const answered = await db.transaction((tx) =>
      recordCancelTimingAnswer(tx, { userId, text, question: asked, timing, context }),
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
      recordIdentityAnswer(tx, { userId, text, question: asked, identity, context }),
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
      recordDuplicateAnswer(tx, {
        userId,
        text,
        question: asked,
        identity: duplicate,
        context,
      }),
    );

    return NextResponse.json(answered, { status: 201 });
  }

  const provider = targetProviderDisplay(target);
  let extraction;

  try {
    extraction = await extractCandidates(text);

    /**
     * A terse "£12 monthly" names nothing, so it is read again with the selected
     * provider in front. A message that did name a service is read as written,
     * so a name other than the selection is seen for what it is.
     */
    if (provider && !extraction.candidates.some((candidate) => candidate.provider.trim())) {
      extraction = await extractCandidates(contextualizeReply(provider, text));
    }
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

  if (target.kind !== "all") {
    const targeted = applyTargetContext(target, extraction.candidates);

    /**
     * A message about a different service than the one selected is a target
     * check, not a guess: the composer asks whether to file it against the
     * selection or as a fresh capture, and nothing is stored until it says.
     */
    if (!targeted.ok) {
      return NextResponse.json(
        {
          error: "target_mismatch",
          message: `That mentions ${targeted.conflicting.join(", ")}, not ${provider}. Send it about all subscriptions, or keep ${provider} selected and say what changed there.`,
          conflicting: targeted.conflicting,
        },
        { status: 409 },
      );
    }

    extraction = { ...extraction, candidates: targeted.candidates };

    if (extraction.candidates.length === 0) {
      return NextResponse.json(
        {
          error: "question_unanswered",
          message:
            "That reply did not include enough to update the record. Try again, or add it by hand.",
        },
        { status: 409 },
      );
    }
  }

  /** One transaction, so a message never lands without its proposals. */
  const result = await db.transaction((tx) =>
    recordChatCapture(tx, {
      userId,
      text,
      extraction,
      question,
      context,
      pinnedSubscriptionId: pinnedSubscriptionId(target),
      revise: target.kind === "proposal" ? target.proposal : null,
    }),
  );

  return NextResponse.json(result, { status: 201 });
}
