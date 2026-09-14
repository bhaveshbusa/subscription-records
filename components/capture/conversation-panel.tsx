"use client";

import { Disclosure } from "@/components/ui/foundations";
import type { ConversationTurn } from "@/lib/capture/conversation";
import {
  partitionTurnOutcomes,
  proposalOutcomeLabel,
  questionOutcomeLabel,
  sourceNeedsDisclosure,
  turnSourceLabel,
  turnSummary,
} from "@/lib/capture/conversation-view";
import type { TargetDescriptor } from "@/lib/capture/target-fields";
import type { ProposalView } from "@/lib/proposals/projection";

function outcomeClass(state: ProposalView["state"]): string {
  switch (state) {
    case "pending":
      return "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900";
    case "accepted":
      return "rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700";
    case "rejected":
      return "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900";
    case "superseded":
      return "rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600";
  }
}

function OutcomeLine({
  name,
  state,
}: {
  name: string;
  state: ProposalView["state"];
}) {
  return (
    <p className={outcomeClass(state)} data-state={state}>
      {name}: {proposalOutcomeLabel(state)}
    </p>
  );
}

/**
 * What has been said about the selected target. Summaries stay on this
 * holding; the original multi-item paste and other services stay behind
 * source disclosure. Stored captures are not rewritten.
 */
export function ConversationPanel({
  turns,
  loading,
  target,
}: {
  turns: ConversationTurn[];
  loading: boolean;
  target: TargetDescriptor;
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
    <details className="rounded-2xl border border-stone-200 bg-white/60 px-4 py-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
        Conversation ({turns.length})
      </summary>
      <ol aria-label="Conversation" className="mt-3 flex flex-col gap-3">
        {turns.map((turn) => {
          const split = partitionTurnOutcomes(turn, target);
          const source = turnSourceLabel(turn);
          const summary = turnSummary(turn);
          const disclose = sourceNeedsDisclosure(turn, target);

          return (
            <li className="flex flex-col gap-1" key={turn.captureId}>
              <p className="text-sm text-stone-900">{summary}</p>
              <p className="text-xs text-stone-500">
                <time dateTime={turn.sentAt}>{new Date(turn.sentAt).toLocaleString()}</time>
              </p>
              {split.relevantProposals.map((proposal) => (
                <OutcomeLine
                  key={proposal.id}
                  name={
                    proposal.subscriptionProvider ??
                    proposal.payload?.provider?.value ??
                    "Card"
                  }
                  state={proposal.state}
                />
              ))}
              {split.relevantQuestions.map((question) => (
                <p
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800"
                  data-state={question.state}
                  key={question.id}
                >
                  {question.question}
                  <span className="ml-2 text-stone-500">
                    {questionOutcomeLabel(question.state)}
                  </span>
                </p>
              ))}
              {disclose ? (
                <Disclosure label="Original capture">
                  <p className="whitespace-pre-wrap pb-2 text-sm text-stone-700">{source}</p>
                  {split.otherProposals.map((proposal) => (
                    <OutcomeLine
                      key={proposal.id}
                      name={
                        proposal.subscriptionProvider ??
                        proposal.payload?.provider?.value ??
                        "Card"
                      }
                      state={proposal.state}
                    />
                  ))}
                  {split.otherQuestions.map((question) => (
                    <p
                      className="mt-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600"
                      data-state={question.state}
                      key={question.id}
                    >
                      {question.provider}: {question.question}
                      <span className="ml-2">{questionOutcomeLabel(question.state)}</span>
                    </p>
                  ))}
                </Disclosure>
              ) : null}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
