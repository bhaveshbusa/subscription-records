"use client";

import Link from "next/link";

import type { ConfirmedTerms } from "@/lib/proposals/confirm";

import { CONFLICT_LABEL } from "./proposal-card";
import type { Outcome } from "./use-proposal-decision";

const CONFIRMED_LABEL: Record<keyof ConfirmedTerms, string> = {
  amountMinor: "amount",
  currency: "currency",
  cadence: "cadence",
  nextRenewal: "next renewal",
};

/** What a decision did, and where the row now lives if one was written. */
export function OutcomeNotice({ outcome }: { outcome: Outcome }) {
  const confirmed = outcome.confirmed.map((field) => CONFIRMED_LABEL[field]);

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      {outcome.decision === "accept" ? (
        <p>
          {outcome.provider} is now in your ledger{" "}
          {confirmed.length > 0
            ? `with your ${confirmed.join(", ")} confirmed.`
            : "with proposed amounts."}{" "}
          {outcome.subscriptionId ? (
            <Link
              className="font-semibold underline"
              href={`/ledger/${outcome.subscriptionId}`}
            >
              Review it
            </Link>
          ) : null}
        </p>
      ) : (
        <p>{outcome.provider} was rejected. Nothing was written to your ledger.</p>
      )}
      {outcome.conflicts.length > 0 ? (
        <p className="mt-1 text-xs">
          Kept your confirmed{" "}
          {outcome.conflicts.map((conflict) => CONFLICT_LABEL[conflict]).join(", ")} and flagged
          the field as conflicted.
        </p>
      ) : null}
    </div>
  );
}
