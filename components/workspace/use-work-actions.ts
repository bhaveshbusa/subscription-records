"use client";

import { useCallback, useState } from "react";

import type { OverdueAction } from "@/lib/inbox/overdue";
import type { InboxQuestion } from "@/lib/inbox/query";
import type { UnresolvedStatus } from "@/lib/inbox/unresolved";
import { formatDate, statusLabel } from "@/lib/subscriptions/format";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

export type WorkOutcome =
  | { action: "still_holding"; provider: string; from: string; to: string }
  | { action: "cancelled"; provider: string; endsOn: string }
  | { action: "unresolved"; provider: string; notesSaved: boolean }
  | { action: "status_set"; provider: string; status: UnresolvedStatus };

export type WorkingAction = OverdueAction | "unresolved" | "status_set";

/** What the write did, in the words the user needs to trust it. */
export function describeWorkOutcome(outcome: WorkOutcome): string {
  if (outcome.action === "still_holding") {
    return `${outcome.provider} is due again ${formatDate(outcome.to)}. That date is inferred from its cadence, not confirmed — set the real one below.`;
  }

  if (outcome.action === "status_set") {
    return `${outcome.provider} is ${statusLabel(outcome.status).toLowerCase()}. Only its status changed — no date was rolled and no amount was confirmed.`;
  }

  if (outcome.action === "unresolved") {
    return outcome.notesSaved
      ? `${outcome.provider} is still unresolved. The note is saved; nothing was cancelled.`
      : `${outcome.provider} is still unresolved. Nothing was cancelled, and no date was invented.`;
  }

  return `${outcome.provider} is cancelled, ending ${formatDate(outcome.endsOn)}. It stays in your ledger under Cancelled.`;
}

/**
 * The writes a subscription that needs reconciling can take, and the one thing
 * an open question can do besides being answered: be put off. Every one goes
 * through the existing endpoint; the list re-reads afterwards because it is a
 * projection, not a cache, and the row may have left the filter it was under.
 */
export function useWorkActions({
  onWritten,
  onQuestionChanged,
}: {
  /** A write changed a ledger row; whoever projects it re-reads. */
  onWritten?: () => void;
  onQuestionChanged?: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [working, setWorking] = useState<WorkingAction | null>(null);
  const [outcomes, setOutcomes] = useState<WorkOutcome[]>([]);
  const [error, setError] = useState<string | null>(null);

  const post = useCallback(
    async (
      item: SubscriptionListItem,
      url: string,
      workingAction: WorkingAction,
      body?: unknown,
    ) => {
      setPending(item.id);
      setWorking(workingAction);
      setError(null);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: body ? { "content-type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        } & Partial<WorkOutcome>;

        if (!response.ok) {
          throw new Error(
            payload.message ??
              (response.status === 401
                ? "Your session has expired. Sign in again to act on your work."
                : "We couldn't save that. Please try again."),
          );
        }

        setOutcomes((current) => [...current, payload as WorkOutcome]);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "We couldn't save that.");
      } finally {
        setPending(null);
        setWorking(null);
        onWritten?.();
      }
    },
    [onWritten],
  );

  const defer = useCallback(
    async (question: InboxQuestion) => {
      setPending(question.id);
      setWorking(null);
      setError(null);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "later", questionId: question.id }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };

        if (!response.ok) {
          throw new Error(
            payload.message ??
              (response.status === 401
                ? "Your session has expired. Sign in again to act on your work."
                : "We couldn't put that off. Please try again."),
          );
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "We couldn't put that off.");
      } finally {
        setPending(null);
        onQuestionChanged?.();
      }
    },
    [onQuestionChanged],
  );

  return { post, defer, pending, working, outcomes, error };
}
