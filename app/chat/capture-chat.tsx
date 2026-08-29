"use client";

import { useCallback, useState } from "react";

import { OutcomeNotice } from "@/components/proposals/outcome-notice";
import { ProposalCard } from "@/components/proposals/proposal-card";
import { useProposalDecision } from "@/components/proposals/use-proposal-decision";
import { MAX_MESSAGE_LENGTH } from "@/lib/capture/message";
import type { ChatCaptureResult } from "@/lib/capture/record";
import type { ProposalView } from "@/lib/proposals/projection";

type Turn = {
  id: string;
  message: string;
  result: ChatCaptureResult;
};

type ChatError = { message: string; unavailable: boolean };

const PLACEHOLDER =
  "I subscribed to Linear\n\nor paste a list:\nNetflix\nSpotify\nNotion\n1Password";

async function readError(response: Response): Promise<ChatError> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
    issues?: { message: string }[];
  } | null;

  if (response.status === 401) {
    return { message: "Your session has expired. Sign in again to capture.", unavailable: false };
  }

  if (payload?.error === "extractor_unavailable") {
    return {
      message: payload.message ?? "Extraction is unavailable on this server.",
      unavailable: true,
    };
  }

  if (payload?.error === "extraction_failed") {
    return {
      message: `Extraction failed: ${payload.message ?? "the model did not answer."}`,
      unavailable: false,
    };
  }

  if (payload?.issues?.length) {
    return { message: payload.issues[0].message, unavailable: false };
  }

  return { message: "We couldn't read that message. Please try again.", unavailable: false };
}

export function CaptureChat() {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const removeProposal = useCallback((id: string) => {
    setTurns((current) =>
      current.map((turn) => ({
        ...turn,
        result: {
          ...turn.result,
          proposals: turn.result.proposals.filter((proposal) => proposal.id !== id),
        },
      })),
    );
  }, []);
  const {
    decide,
    pending,
    error: decideError,
    outcomes,
  } = useProposalDecision({ onDecided: removeProposal });

  const send = useCallback(async () => {
    const text = message.trim();

    if (text.length === 0 || sending) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        setError(await readError(response));

        return;
      }

      const result = (await response.json()) as ChatCaptureResult;

      setTurns((current) => [...current, { id: result.captureId, message: text, result }]);
      setMessage("");
    } catch {
      setError({ message: "We couldn't reach the server. Please try again.", unavailable: false });
    } finally {
      setSending(false);
    }
  }, [message, sending]);

  return (
    <section className="mx-auto mt-10 flex w-full max-w-5xl flex-col gap-6">
      <ol className="flex flex-col gap-6" aria-label="Capture conversation">
        {turns.map((turn) => (
          <li className="flex flex-col gap-4" key={turn.id}>
            <p className="self-end whitespace-pre-wrap rounded-3xl bg-emerald-950 px-5 py-3 text-sm text-white">
              {turn.message}
            </p>

            {turn.result.notice ? (
              <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {turn.result.notice}
              </p>
            ) : null}

            {turn.result.matches.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {turn.result.matches.map((match) => (
                  <li
                    className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-700"
                    key={`${match.subscriptionId}-${match.candidateProvider}`}
                  >
                    {match.strength === "high"
                      ? `You already have ${match.provider}. ${
                          match.proposalId
                            ? "This updates that record rather than adding another."
                            : "Nothing new to add, so nothing changed."
                        }`
                      : `This looks like your existing ${match.provider}.`}
                  </li>
                ))}
              </ul>
            ) : null}

            {turn.result.deferred ? (
              <p className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-700">
                No problem — I won&apos;t ask about {turn.result.deferred.provider} again until
                you bring it up.
              </p>
            ) : turn.result.proposals.length === 0 && turn.result.matches.length === 0 ? (
              <p className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-700">
                I couldn&apos;t find a subscription in that. Try naming the service, or paste one
                per line.
              </p>
            ) : turn.result.proposals.length === 0 ? null : (
              <>
                <p className="text-sm text-stone-600">
                  {turn.result.proposals.length === 1
                    ? "One proposal. Accept it to write it to your ledger."
                    : `${turn.result.proposals.length} proposals. Accept the ones you want in your ledger.`}
                </p>
                <ul className="flex flex-col gap-4">
                  {turn.result.proposals.map((proposal: ProposalView) => (
                    <li key={proposal.id}>
                      <ProposalCard
                        busy={pending !== null}
                        onDecide={(item, decision, confirm) =>
                          void decide(item, decision, confirm)
                        }
                        proposal={proposal}
                        working={pending === proposal.id}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}

            {turn.result.followUp ? (
              <p className="rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-900">
                {turn.result.followUp.question}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      {outcomes.map((outcome, index) => (
        <OutcomeNotice key={`${outcome.provider}-${index}`} outcome={outcome} />
      ))}

      {decideError ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {decideError}
        </p>
      ) : null}

      {error ? (
        <p
          className={
            error.unavailable
              ? "rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              : "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          }
        >
          {error.message}
        </p>
      ) : null}

      <form
        className="flex flex-col gap-3 rounded-3xl border border-stone-200 bg-white/80 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500" htmlFor="chat-message">
          Message
        </label>
        <textarea
          className="min-h-28 w-full resize-y rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-emerald-700"
          id="chat-message"
          maxLength={MAX_MESSAGE_LENGTH}
          name="message"
          onChange={(event) => setMessage(event.target.value)}
          placeholder={PLACEHOLDER}
          value={message}
        />
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-stone-500">
            Prices, cadences, and dates stay proposed until you confirm them.
          </p>
          <button
            className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
            disabled={sending || message.trim().length === 0}
            type="submit"
          >
            {sending ? "Reading…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
