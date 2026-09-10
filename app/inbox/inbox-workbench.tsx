"use client";

import { useCallback, useState } from "react";

import { CaptureComposer } from "@/components/capture/capture-composer";
import type { ChatCaptureResult } from "@/lib/capture/record";
import type { InboxQuestion } from "@/lib/inbox/query";

import { LedgerSections } from "./ledger-sections";
import { ProposalInbox } from "./proposal-inbox";

function questionFromFollowUp(result: ChatCaptureResult): InboxQuestion | null {
  if (!result.followUp) {
    return null;
  }

  return {
    id: result.followUp.id,
    provider: result.followUp.provider,
    reason: result.followUp.reason,
    state: "asked",
    question: result.followUp.question,
    subscriptionId: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Inbox is one page: capture at the top, and everything a capture can produce
 * below it. The pieces are siblings rather than nested, so a proposal is only
 * ever rendered once — in Proposals — however it got there.
 *
 * The two counters here are the wiring between them. A capture raises pending
 * proposals, so Proposals re-reads; a decision on a proposal can write a ledger
 * row, so the projected sections re-read. Neither holds a copy of the other's
 * data, which is why re-reading is all the coordination they need.
 */
export function InboxWorkbench() {
  const [captured, setCaptured] = useState(0);
  const [decided, setDecided] = useState(0);
  const [replyTo, setReplyTo] = useState<InboxQuestion | null>(null);

  const onCaptured = useCallback((result: ChatCaptureResult) => {
    setCaptured((value) => value + 1);

    if (result.deferred) {
      setReplyTo(null);

      return;
    }

    setReplyTo(questionFromFollowUp(result));
  }, []);
  const onDecided = useCallback(() => setDecided((value) => value + 1), []);
  const onQuestionChanged = useCallback(() => {
    setCaptured((value) => value + 1);
    setReplyTo(null);
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="sticky top-0 z-10 -mx-2 bg-[#f5f3ef]/95 px-2 pb-4 pt-6 backdrop-blur">
        <CaptureComposer
          onCaptured={onCaptured}
          onClearReplyTo={() => setReplyTo(null)}
          replyTo={replyTo}
        />
      </div>

      <ProposalInbox onDecided={onDecided} refreshKey={captured} />
      <LedgerSections
        onAnswerQuestion={setReplyTo}
        onQuestionChanged={onQuestionChanged}
        refreshKey={captured + decided}
        replyToId={replyTo?.id ?? null}
      />
    </div>
  );
}
