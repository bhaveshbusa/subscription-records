"use client";

import { useState } from "react";

import type { OverdueAction } from "@/lib/inbox/overdue";

export type CancelDecision =
  | { action: "cancelled"; endsOn: string; notes: string; unknownTiming?: false }
  | { action: "cancelled"; unknownTiming: true; notes: string };

/**
 * The two answers only the user can give about a passed due date. Cancelled
 * asks for the actual end date instead of silently using a stale stored renewal.
 */
export function OverdueActions({
  busy,
  onCancel,
  onDecide,
  trial,
  working,
}: {
  busy: boolean;
  onCancel: (decision: CancelDecision) => void;
  onDecide: (action: Extract<OverdueAction, "still_holding">) => void;
  trial: boolean;
  working: OverdueAction | "unresolved" | null;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [endsOn, setEndsOn] = useState("");
  const [notes, setNotes] = useState("");

  const label = (action: OverdueAction | "unresolved", idle: string) =>
    working === action ? "Saving…" : idle;

  if (reviewing) {
    return (
      <div className="flex w-full min-w-[16rem] flex-col gap-2">
        <p className="text-xs text-stone-600">
          A stored renewal date is not when it ended. Say the actual date, or that
          you do not know.
        </p>
        <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700">
          Ended on
          <input
            className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 font-normal text-sm"
            disabled={busy}
            onChange={(event) => setEndsOn(event.target.value)}
            type="date"
            value={endsOn}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700">
          Notes
          <textarea
            className="min-h-16 rounded-lg border border-stone-300 bg-white px-2 py-1.5 font-normal text-sm"
            disabled={busy}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional. If the date is unknown, a note keeps the question open."
            value={notes}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-xl bg-emerald-950 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
            disabled={busy || endsOn === ""}
            onClick={() => onCancel({ action: "cancelled", endsOn, notes })}
            type="button"
          >
            {label("cancelled", "Confirm cancelled")}
          </button>
          <button
            className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-800 transition hover:border-stone-500 disabled:opacity-60"
            disabled={busy}
            onClick={() =>
              onCancel({ action: "cancelled", unknownTiming: true, notes })
            }
            type="button"
          >
            {label("unresolved", "I don't know when")}
          </button>
          <button
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-900 disabled:opacity-60"
            disabled={busy}
            onClick={() => setReviewing(false)}
            type="button"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {trial ? null : (
        <button
          className="rounded-xl bg-emerald-950 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
          disabled={busy}
          onClick={() => onDecide("still_holding")}
          type="button"
        >
          {label("still_holding", "Still have it")}
        </button>
      )}
      <button
        className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-800 transition hover:border-stone-500 disabled:opacity-60"
        disabled={busy}
        onClick={() => setReviewing(true)}
        type="button"
      >
        Cancelled
      </button>
    </div>
  );
}
