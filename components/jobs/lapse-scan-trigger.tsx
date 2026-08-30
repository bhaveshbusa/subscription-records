"use client";

import { useCallback, useState } from "react";

import type { LapseScanResponse } from "@/lib/jobs/lapse-scan";

/** What the run found, in a line the tester can read without opening the ledger. */
function summarise(result: LapseScanResponse): string {
  if (result.proposed.length > 0) {
    const providers = result.proposed.map((entry) => entry.provider).join(", ");

    return `Raised ${result.proposed.length} lapse proposal${
      result.proposed.length === 1 ? "" : "s"
    } for ${providers}. Nothing has changed in your ledger yet.`;
  }

  if (result.scanned === 0) {
    return `No subscription has a renewal older than ${result.renewalCutoff}, so there is nothing to raise.`;
  }

  return `Looked at ${result.scanned} overdue renewal${
    result.scanned === 1 ? "" : "s"
  } and raised nothing: they are either still being paid or already answered.`;
}

/**
 * Runs the lapse scan by hand, so a preview can be tested without waiting for the
 * nightly cron. The scan only ever writes proposals, so pressing this cannot
 * change a subscription.
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
          The lapse scan runs nightly. Run it now to check for subscriptions whose renewal
          passed with no payment since.
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
