"use client";

import { useCallback, useState } from "react";

import type { ProposalConflict } from "@/lib/proposals/apply";
import type { ConfirmedTerms } from "@/lib/proposals/confirm";
import type { ProposalView } from "@/lib/proposals/projection";

import { proposalTitle, type Decision } from "./proposal-card";

export type Outcome = {
  decision: Decision;
  provider: string;
  subscriptionId: string | null;
  conflicts: ProposalConflict[];
  /** Terms the person set on the card, and so the ledger now trusts. */
  confirmed: (keyof ConfirmedTerms)[];
};

function decisionErrorMessage(error: string | undefined, decision: Decision): string {
  switch (error) {
    case "not_pending":
      return "That proposal was already decided.";
    case "duplicate_holding":
      return "That subscription was already added from an earlier card. Reject this one, or edit the record instead.";
    case "stale_target":
      return "That record has changed since this card was raised. Check the record and capture it again.";
    default:
      return `We couldn't ${decision} that proposal. Please try again.`;
  }
}

/**
 * Accept and reject go through the same endpoints wherever a card is shown, so
 * `/chat` and `/inbox` share the request, the wording, and the ledger guarantee:
 * nothing is written until this call succeeds.
 */
export function useProposalDecision(options: { onDecided?: (id: string) => void } = {}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const onDecided = options.onDecided;

  const decide = useCallback(
    async (proposal: ProposalView, decision: Decision, confirm?: ConfirmedTerms) => {
      setPending(proposal.id);
      setError(null);

      try {
        const response = await fetch(`/api/proposals/${proposal.id}/${decision}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(confirm ? { confirm } : {}),
        });
        const payload = (await response.json()) as {
          error?: string;
          subscriptionId?: string | null;
          conflicts?: ProposalConflict[];
        };

        if (!response.ok) {
          throw new Error(decisionErrorMessage(payload.error, decision));
        }

        onDecided?.(proposal.id);
        setOutcomes((current) => [
          {
            decision,
            provider: proposalTitle(proposal),
            subscriptionId: payload.subscriptionId ?? null,
            conflicts: payload.conflicts ?? [],
            confirmed: confirm
              ? (Object.keys(confirm) as (keyof ConfirmedTerms)[]).filter(
                  (field) => field !== "currency",
                )
              : [],
          },
          ...current,
        ]);

        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "That decision didn't go through.");

        return false;
      } finally {
        setPending(null);
      }
    },
    [onDecided],
  );

  return { decide, pending, error, setError, outcomes };
}
