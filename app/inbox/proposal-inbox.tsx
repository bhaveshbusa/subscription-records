"use client";

import { useCallback, useEffect, useState } from "react";

import { RollStaleRenewalTrigger } from "@/components/jobs/roll-stale-renewal-trigger";
import { OutcomeNotice } from "@/components/proposals/outcome-notice";
import { ProposalCard } from "@/components/proposals/proposal-card";
import { useProposalDecision } from "@/components/proposals/use-proposal-decision";
import type { ConfirmedTerms } from "@/lib/proposals/confirm";
import type { ProposalView } from "@/lib/proposals/projection";

export function ProposalInbox({
  showRollStaleRenewal = false,
}: {
  showRollStaleRenewal?: boolean;
}) {
  const [items, setItems] = useState<ProposalView[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [listError, setListError] = useState<string | null>(null);
  const removeItem = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);
  const {
    decide,
    pending,
    error: decideError,
    outcomes,
  } = useProposalDecision({ onDecided: removeItem });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setListError(null);

      try {
        const response = await fetch("/api/proposals?state=pending", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Your session has expired. Sign in again to view your inbox."
              : "We couldn't load your inbox. Please try again.",
          );
        }

        const payload = (await response.json()) as { items?: ProposalView[] };

        setItems(payload.items ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setListError(error instanceof Error ? error.message : "We couldn't load your inbox.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [attempt]);

  const onDecide = useCallback(
    async (
      proposal: ProposalView,
      decision: "accept" | "reject",
      confirm?: ConfirmedTerms,
    ) => {
      const decided = await decide(proposal, decision, confirm);

      /** A failed decision may mean the inbox is stale, so reload it. */
      if (!decided) {
        setAttempt((value) => value + 1);
      }
    },
    [decide],
  );

  return (
    <section className="mx-auto mt-10 w-full max-w-5xl">
      {showRollStaleRenewal ? (
        <div className="mb-4">
          <RollStaleRenewalTrigger onRolled={() => setAttempt((value) => value + 1)} />
        </div>
      ) : null}

      {outcomes.map((outcome, index) => (
        <div className="mb-3" key={`${outcome.provider}-${index}`}>
          <OutcomeNotice outcome={outcome} />
        </div>
      ))}

      {decideError ? (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {decideError}
        </div>
      ) : null}

      <div aria-busy={loading} aria-label="Pending proposals" role="region">
        {loading ? (
          <div className="rounded-3xl border border-stone-200 bg-white/70 px-6 py-14 text-center text-sm text-stone-600">
            Loading…
          </div>
        ) : listError ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-6 py-10 text-center">
            <p className="text-sm text-red-800">{listError}</p>
            <button
              className="mt-4 rounded-xl bg-emerald-950 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              onClick={() => setAttempt((value) => value + 1)}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
            <p className="text-lg font-medium text-stone-800">Nothing waiting for you.</p>
            <p className="mt-2 text-sm text-stone-500">
              Proposals appear here before they can touch your ledger.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {items.map((proposal) => (
              <li key={proposal.id}>
                <ProposalCard
                  busy={pending !== null}
                  onDecide={(item, decision, confirm) =>
                    void onDecide(item, decision, confirm)
                  }
                  proposal={proposal}
                  working={pending === proposal.id}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
