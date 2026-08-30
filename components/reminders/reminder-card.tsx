"use client";

import Link from "next/link";

import type { ReminderKind, ReminderView } from "@/lib/reminders/projection";
import { formatDate } from "@/lib/subscriptions/format";

export const REMINDER_KIND_LABEL: Record<ReminderKind, string> = {
  deferred_terms: "Terms you put off",
  upcoming_renewal: "Renewal coming up",
};

/**
 * A reminder card carries no Accept, because there is nothing to apply: it says
 * what is due and links to the subscription, where the user changes what they
 * choose to change. Dismiss only hides the card.
 */
export function ReminderCard({
  busy,
  onDismiss,
  reminder,
  working = false,
}: {
  busy?: boolean;
  onDismiss: (reminder: ReminderView) => void;
  reminder: ReminderView;
  working?: boolean;
}) {
  return (
    <article className="rounded-3xl border border-stone-200 bg-white/80 px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
            {REMINDER_KIND_LABEL[reminder.kind]} · {formatDate(reminder.dueOn)}
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold text-stone-950">
            {reminder.subscriptionProvider ?? "Unknown provider"}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Link
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500"
            href={`/ledger/${reminder.subscriptionId}`}
          >
            Open subscription
          </Link>
          <button
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500 disabled:opacity-60"
            disabled={busy}
            onClick={() => onDismiss(reminder)}
            type="button"
          >
            {working ? "Dismissing…" : "Dismiss"}
          </button>
        </div>
      </div>
      <p className="mt-3 text-sm text-stone-700">{reminder.body}</p>
      <p className="mt-2 text-xs text-stone-500">
        A reminder changes nothing on its own. Prices and dates stay exactly as trusted as they
        were until you confirm them yourself.
      </p>
    </article>
  );
}
