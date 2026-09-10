import type { ReactNode } from "react";

import Link from "next/link";

import {
  cadenceLabel,
  formatDate,
  formatMoneyMinor,
  isTrialHolding,
  statusLabel,
} from "@/lib/subscriptions/format";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

/**
 * One ledger row as it appears in an Inbox section: enough to recognise it, a
 * link to its detail, and — where the section has something to decide —
 * whatever actions the section hands down.
 */
export function InboxSubscriptionRow({
  item,
  dateLabel,
  dateValue,
  actions = null,
  onDiscuss,
  selected = false,
}: {
  item: SubscriptionListItem;
  dateLabel: string;
  dateValue?: string | null;
  actions?: ReactNode;
  /** Make the capture box about this one holding. */
  onDiscuss?: (item: SubscriptionListItem) => void;
  /** The capture box is already about this holding. */
  selected?: boolean;
}) {
  const amount = item.amount.value
    ? formatMoneyMinor(item.amount.value.minor, item.amount.value.currency)
    : null;
  const cadence = cadenceLabel(item.cadence.value);
  const shown = dateValue === undefined ? item.nextRenewal.value : dateValue;
  const expected =
    item.expectedNextRenewal && item.expectedNextRenewal.value !== item.nextRenewal.value
      ? item.expectedNextRenewal.value
      : null;

  return (
    <div
      className={
        selected
          ? "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-2xl border border-emerald-400 bg-emerald-50/60 px-4 py-3"
          : "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-2xl border border-stone-200 bg-white/80 px-4 py-3"
      }
    >
      <div className="min-w-0">
        <Link
          className="font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700"
          href={`/ledger/${item.id}`}
        >
          {item.provider.value}
        </Link>
        <p className="mt-1 text-xs text-stone-500">
          {statusLabel(item.status.value)}
          {amount
            ? ` · ${amount}${isTrialHolding(item.status.value) ? " after trial" : ""}`
            : ""}
          {item.cadence.value ? ` · ${cadence}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm tabular-nums text-stone-700">
          <span className="text-stone-500">{dateLabel} </span>
          {formatDate(shown)}
          {expected && shown !== expected ? (
            <span className="mt-1 block text-xs text-stone-500">
              Expected {formatDate(expected)} (inferred)
            </span>
          ) : item.expectedNextRenewal && shown === item.expectedNextRenewal.value ? (
            <span className="mt-1 block text-xs text-stone-500">Inferred / expected</span>
          ) : null}
        </p>
        {actions}
        {onDiscuss ? (
          <button
            aria-pressed={selected}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:border-emerald-700"
            onClick={() => onDiscuss(item)}
            type="button"
          >
            {selected ? "Talking about this" : "Talk about this"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
