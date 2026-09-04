"use client";

import { useCallback, useState } from "react";

import type { RollStaleRenewalResponse } from "@/lib/jobs/roll-stale-renewal";

/** What the run did, in a line the tester can read without opening the ledger. */
function summarise(result: RollStaleRenewalResponse): string {
  if (result.rolled.length > 0) {
    const providers = result.rolled.map((entry) => entry.provider).join(", ");

    return `Rolled ${result.rolled.length} stale due date${
      result.rolled.length === 1 ? "" : "s"
    } for ${providers} to the next inferred renewal.`;
  }

  if (result.scanned === 0) {
    return "No holding subscription has a due date in the past, so there was nothing to roll.";
  }

  return `Looked at ${result.scanned} stale due date${
    result.scanned === 1 ? "" : "s"
  } and rolled none: they have no cadence to advance by.`;
}

/**
 * Runs the stale-renewal roll by hand, so a preview can be tested without
 * waiting for the nightly cron. It writes inferred due dates on holding rows;
 * it does not raise a proposal.
 */
export function RollStaleRenewalTrigger({ onRolled }: { onRolled: () => void }) {
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/jobs/roll-stale-renewal", { method: "POST" });

      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "Your session has expired. Sign in again to roll stale renewals."
            : "Stale renewals could not be rolled. Please try again.",
        );
      }

      const result = (await response.json()) as RollStaleRenewalResponse;

      setNotice(summarise(result));
      onRolled();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Stale renewals could not be rolled.",
      );
    } finally {
      setRunning(false);
    }
  }, [onRolled]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">
          The nightly job rolls past due dates forward on holding rows. Run it
          now: it updates the ledger and does not treat silence as a lapse.
        </p>
        <button
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500 disabled:opacity-60"
          disabled={running}
          onClick={() => void run()}
          type="button"
        >
          {running ? "Rolling…" : "Roll stale renewals"}
        </button>
      </div>
      {notice ? <p className="mt-2 text-sm text-emerald-900">{notice}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-800">{error}</p> : null}
    </div>
  );
}
