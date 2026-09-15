"use client";

import Link from "next/link";

import { Feedback } from "@/components/ui/foundations";
import type { ConfirmedTerms } from "@/lib/proposals/confirm";
import { recordWorkspaceHref } from "@/lib/workspace/view";

import { CONFLICT_LABEL } from "./proposal-card";
import type { Outcome } from "./use-proposal-decision";

const CONFIRMED_LABEL: Record<keyof ConfirmedTerms, string> = {
  subscriptionStatus: "status",
  provider: "provider",
  amountMinor: "amount",
  currency: "currency",
  cadence: "cadence",
  nextRenewal: "next renewal",
  trialEndsOn: "trial end",
  autoRenewal: "auto-renewal",
};

/** Action-specific success or reject copy for a decided proposal. */
export function describeDecisionOutcome(outcome: Outcome): string {
  if (outcome.decision === "reject") {
    return `${outcome.provider} was rejected. Nothing was saved.`;
  }

  const confirmed = outcome.confirmed.map((field) => CONFIRMED_LABEL[field]);
  const withConfirmed =
    confirmed.length > 0 ? ` with your ${confirmed.join(", ")} confirmed` : "";

    switch (outcome.kind) {
    case "create":
      return confirmed.length > 0
        ? `${outcome.provider} is now a saved subscription${withConfirmed}.`
        : `${outcome.provider} is now a saved subscription with its amounts still proposed.`;
    case "update":
      return confirmed.length > 0
        ? `${outcome.provider} was updated${withConfirmed}.`
        : `${outcome.provider} was updated.`;
    case "terms_changed":
      return confirmed.length > 0
        ? `${outcome.provider} terms were applied${withConfirmed}.`
        : `${outcome.provider} terms were applied.`;
    case "charged":
      return `${outcome.provider} was updated from that charge note.`;
    case "cancelled":
      return `${outcome.provider} is cancelled. It stays in your ledger under Cancelled.`;
    case "cancel_scheduled":
      return `${outcome.provider} is scheduled to cancel.`;
    case "reactivated":
      return confirmed.length > 0
        ? `${outcome.provider} is active again${withConfirmed}.`
        : `${outcome.provider} is active again.`;
    case "lapsed":
      return `${outcome.provider} was accepted.`;
  }
}

function conflictNote(outcome: Outcome): string | null {
  if (outcome.conflicts.length === 0) {
    return null;
  }

  return `Kept your confirmed ${outcome.conflicts
    .map((conflict) => CONFLICT_LABEL[conflict])
    .join(", ")} and flagged the field as conflicted.`;
}

/**
 * What a decision did. When the notice already sits on that open row, do not
 * offer Open it — the person is already looking at it.
 */
export function OutcomeNotice({
  outcome,
  alreadyOnRow = false,
}: {
  outcome: Outcome;
  alreadyOnRow?: boolean;
}) {
  const tone = outcome.decision === "accept" ? "success" : "info";
  const conflicts = conflictNote(outcome);
  const showOpen =
    outcome.decision === "accept" &&
    !alreadyOnRow &&
    Boolean(outcome.subscriptionId);

  return (
    <Feedback tone={tone}>
      <span>{describeDecisionOutcome(outcome)}</span>
      {showOpen ? (
        <>
          {" "}
          <Link
            className="font-semibold underline"
            href={recordWorkspaceHref(outcome.subscriptionId!)}
          >
            Open it
          </Link>
        </>
      ) : null}
      {conflicts ? <span className="mt-1 block text-xs">{conflicts}</span> : null}
    </Feedback>
  );
}
