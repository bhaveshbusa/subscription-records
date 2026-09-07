import Link from "next/link";

import {
  cadenceLabel,
  formatDate,
  formatMoneyMinor,
  statusLabel,
} from "@/lib/subscriptions/format";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

/**
 * One ledger row as it appears in an Inbox section: enough to recognise it and
 * a link to the only place it can be changed. There are no actions here — the
 * sections say what is waiting, the detail page is where you act.
 */
export function InboxSubscriptionRow({
  item,
  dateLabel,
}: {
  item: SubscriptionListItem;
  dateLabel: string;
}) {
  const amount = item.amount.value
    ? formatMoneyMinor(item.amount.value.minor, item.amount.value.currency)
    : null;
  const cadence = cadenceLabel(item.cadence.value);

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-2xl border border-stone-200 bg-white/80 px-4 py-3">
      <div className="min-w-0">
        <Link
          className="font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700"
          href={`/ledger/${item.id}`}
        >
          {item.provider.value}
        </Link>
        <p className="mt-1 text-xs text-stone-500">
          {statusLabel(item.status.value)}
          {amount ? ` · ${amount}` : ""}
          {item.cadence.value ? ` · ${cadence}` : ""}
        </p>
      </div>
      <p className="text-sm tabular-nums text-stone-700">
        <span className="text-stone-500">{dateLabel} </span>
        {formatDate(item.nextRenewal.value)}
      </p>
    </div>
  );
}
