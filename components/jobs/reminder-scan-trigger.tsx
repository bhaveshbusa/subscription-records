"use client";

import { useCallback, useState } from "react";

import type { ReminderScanResponse } from "@/lib/jobs/reminder-scan";

/** What the run raised, in a line the tester can read without opening the ledger. */
function summarise(result: ReminderScanResponse): string {
  if (result.raised.length > 0) {
    const providers = [...new Set(result.raised.map((entry) => entry.provider))].join(", ");

    return `Raised ${result.raised.length} reminder${
      result.raised.length === 1 ? "" : "s"
    } for ${providers}. Nothing in your ledger has changed.`;
  }

  if (result.scanned === 0) {
    return `Nothing renews on or before ${result.renewalHorizon}, and no deferred terms are due, so there is nothing to remind you about.`;
  }

  return `Looked at ${result.scanned} subscription${
    result.scanned === 1 ? "" : "s"
  } and raised nothing new: you have already been reminded about them.`;
}

/**
 * Runs the reminder scan by hand, so a preview can be tested without waiting for
 * the nightly cron. The scan only ever writes reminders, so pressing this cannot
 * change a subscription.
 */
export function ReminderScanTrigger({ onScanned }: { onScanned: () => void }) {
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/jobs/reminder-scan", { method: "POST" });

      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "Your session has expired. Sign in again to run the scan."
            : "The reminder scan could not be run. Please try again.",
        );
      }

      const result = (await response.json()) as ReminderScanResponse;

      setNotice(summarise(result));
      onScanned();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The reminder scan could not be run.");
    } finally {
      setRunning(false);
    }
  }, [onScanned]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">
          The reminder scan runs nightly. Run it now to look for renewals in the next week and
          terms you asked to be reminded about.
        </p>
        <button
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500 disabled:opacity-60"
          disabled={running}
          onClick={() => void run()}
          type="button"
        >
          {running ? "Scanning…" : "Run reminder scan"}
        </button>
      </div>
      {notice ? <p className="mt-2 text-sm text-emerald-900">{notice}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-800">{error}</p> : null}
    </div>
  );
}
