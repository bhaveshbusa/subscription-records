"use client";

import { useCallback, useState } from "react";

import type { LapseScanResponse } from "@/lib/jobs/lapse-scan";

/** What the run did, in a line the tester can read without opening the ledger. */
function summarise(result: LapseScanResponse): string {
  if (result.rolled.length > 0) {
    const providers = result.rolled.map((entry) => entry.provider).join(", ");

    return `Rolled ${result.rolled.length} stale due date${
      result.rolled.length === 1 ? "" : "s"
    } for ${providers} to the next inferred renewal. No lapse was proposed.`;
  }

  if (result.scanned === 0) {
    return "No holding subscription has a due date in the past, so there was nothing to roll.";
  }

  return `Looked at ${result.scanned} stale due date${
    result.scanned === 1 ? "" : "s"
  } and rolled none: they have no cadence to advance by.`;
}

/**
 * Runs the stale-schedule scan by hand, so a preview can be tested without
 * waiting for the nightly cron. It rolls past due dates to inferred; it does
 * not propose a lapse from silence.
 */
export function LapseScanTrigger({ onScanned }: { onScanned: () => void }) {
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/jobs/lapse-scan", { method: "POST" });

      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "Your session has expired. Sign in again to run the scan."
            : "The lapse scan could not be run. Please try again.",
        );
      }

      const result = (await response.json()) as LapseScanResponse;

      setNotice(summarise(result));
      onScanned();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The lapse scan could not be run.");
    } finally {
      setRunning(false);
    }
  }, [onScanned]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">
          The nightly scan rolls past due dates forward. Run it now: it will not
          treat silence as a lapse.
        </p>
        <button
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500 disabled:opacity-60"
          disabled={running}
          onClick={() => void run()}
          type="button"
        >
          {running ? "Scanning…" : "Run lapse scan"}
        </button>
      </div>
      {notice ? <p className="mt-2 text-sm text-emerald-900">{notice}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-800">{error}</p> : null}
    </div>
  );
}
