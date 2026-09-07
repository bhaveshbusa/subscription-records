"use client";

import type { OverdueAction } from "@/lib/inbox/overdue";

/**
 * The two answers only the user can give about a passed due date. Nothing else
 * in the app writes `next_renewal` on its own, so these buttons are the whole
 * of "the schedule moved on" and "it stopped".
 */
export function OverdueActions({
  busy,
  onDecide,
  working,
}: {
  busy: boolean;
  onDecide: (action: OverdueAction) => void;
  working: OverdueAction | null;
}) {
  const label = (action: OverdueAction, idle: string) =>
    working === action ? "Saving…" : idle;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="rounded-xl bg-emerald-950 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
        disabled={busy}
        onClick={() => onDecide("still_holding")}
        type="button"
      >
        {label("still_holding", "Still have it")}
      </button>
      <button
        className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-800 transition hover:border-stone-500 disabled:opacity-60"
        disabled={busy}
        onClick={() => onDecide("cancelled")}
        type="button"
      >
        {label("cancelled", "Cancelled")}
      </button>
    </div>
  );
}
