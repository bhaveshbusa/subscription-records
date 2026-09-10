"use client";

import type { ConversationTurn } from "@/lib/capture/conversation";
import type { ProposalView } from "@/lib/proposals/projection";

const STATE_LABEL: Record<ProposalView["state"], string> = {
  pending: "Waiting for your decision",
  accepted: "Applied to your ledger",
  rejected: "Rejected — nothing changed",
  superseded: "Replaced by a later card",
};

const QUESTION_STATE_LABEL: Record<ConversationTurn["questions"][number]["state"], string> = {
  asked: "Still open",
  deferred: "Put off — still open",
  answered: "Answered",
};

function turnText(turn: ConversationTurn): string {
  if (turn.kind === "text") {
    return turn.content ?? "";
  }

  const what = turn.kind === "audio" ? "Voice note" : turn.kind === "pdf" ? "PDF" : "Screenshot";

  return turn.fileName ? `${what}: ${turn.fileName}` : what;
}

/**
 * What has been said about the selected target so far, read back from the
 * server rather than remembered by the page: a reload or a later visit shows
 * the same turns, and each proposal and question carries where it has got to,
 * so applied, still-pending, and rejected are never confused. Decisions are
 * still made in Proposals; this is the record of the conversation, not a
 * second place to decide.
 */
export function ConversationPanel({
  turns,
  loading,
}: {
  turns: ConversationTurn[];
  loading: boolean;
}) {
  if (loading && turns.length === 0) {
    return (
      <p className="px-1 text-xs text-stone-500" aria-live="polite">
        Loading what has been said about this…
      </p>
    );
  }

  if (turns.length === 0) {
    return (
      <p className="px-1 text-xs text-stone-500">Nothing has been said about this yet.</p>
    );
  }

  return (
    <details className="rounded-2xl border border-stone-200 bg-white/60 px-4 py-3" open>
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
        Said about this ({turns.length})
      </summary>
      <ol aria-label="Conversation" className="mt-3 flex flex-col gap-3">
        {turns.map((turn) => (
          <li className="flex flex-col gap-1" key={turn.captureId}>
            <p className="whitespace-pre-wrap text-sm text-stone-900">{turnText(turn)}</p>
            <p className="text-xs text-stone-500">
              <time dateTime={turn.sentAt}>{new Date(turn.sentAt).toLocaleString()}</time>
            </p>
            {turn.proposals.map((proposal) => (
              <p
                className={
                  proposal.state === "pending"
                    ? "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
                    : proposal.state === "accepted"
                      ? "rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700"
                      : "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                }
                data-state={proposal.state}
                key={proposal.id}
              >
                {proposal.subscriptionProvider ?? proposal.payload?.provider?.value ?? "Card"}:{" "}
                {STATE_LABEL[proposal.state]}
              </p>
            ))}
            {turn.questions.map((question) => (
              <p
                className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800"
                data-state={question.state}
                key={question.id}
              >
                {question.question}
                <span className="ml-2 text-stone-500">{QUESTION_STATE_LABEL[question.state]}</span>
              </p>
            ))}
          </li>
        ))}
      </ol>
    </details>
  );
}
