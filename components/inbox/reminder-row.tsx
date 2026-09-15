import Link from "next/link";

import type { InboxReminder } from "@/lib/inbox/query";
import {
  cadenceLabel,
  formatDate,
  formatMoneyMinor,
  isTrialHolding,
  reminderTargetLabel,
  statusLabel,
} from "@/lib/subscriptions/format";

/**
 * A preference-driven reminder or a due cancellation intention on a
 * subscription. There is no dismiss, snooze, or mark-read: preference cards
 * leave when their due window ends; cancellation intentions stay until the
 * user resolves them. Opening the workspace does not clear either.
 */
export function InboxReminderRow({
  reminder,
  href,
}: {
  reminder: InboxReminder;
  /** Where the holding's name opens its record. */
  href: string;
}) {
  const { item } = reminder;
  const amount = item.amount.value
    ? formatMoneyMinor(item.amount.value.minor, item.amount.value.currency)
    : null;
  const cadence = cadenceLabel(item.cadence.value);

  if (reminder.kind === "cancellation_intention") {
    return (
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-2xl border border-stone-200 bg-white/80 px-4 py-3">
        <div className="min-w-0">
          <Link
            className="font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700"
            href={href}
          >
            {item.provider.value}
          </Link>
          <p className="mt-1 text-xs text-stone-500">
            Planning to cancel
            {` · ${statusLabel(item.status.value)}`}
            {amount
              ? ` · ${amount}${isTrialHolding(item.status.value) ? " after trial" : ""}`
              : ""}
            {item.cadence.value ? ` · ${cadence}` : ""}
          </p>
        </div>
        <p className="text-sm tabular-nums text-stone-700">
          <span className="text-stone-500">Remind from </span>
          {formatDate(reminder.remindOn)}
          <span className="mt-1 block text-xs text-stone-500">
            Stays until you cancel or keep the subscription
          </span>
        </p>
      </div>
    );
  }

  const inferred = reminder.basis === "expected";

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-2xl border border-stone-200 bg-white/80 px-4 py-3">
      <div className="min-w-0">
        <Link
          className="font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700"
          href={href}
        >
          {item.provider.value}
        </Link>
        <p className="mt-1 text-xs text-stone-500">
          {reminderTargetLabel(reminder.target)}
          {` · ${statusLabel(item.status.value)}`}
          {amount
            ? ` · ${amount}${isTrialHolding(item.status.value) ? " after trial" : ""}`
            : ""}
          {item.cadence.value ? ` · ${cadence}` : ""}
        </p>
      </div>
      <p className="text-sm tabular-nums text-stone-700">
        <span className="text-stone-500">{inferred ? "Expected " : "Due "} </span>
        {formatDate(reminder.dueDate)}
        {inferred ? (
          <span className="mt-1 block text-xs text-stone-500">Inferred / expected</span>
        ) : null}
        <span className="mt-1 block text-xs text-stone-500">
          From {formatDate(reminder.reminderDate)}
        </span>
      </p>
    </div>
  );
}
