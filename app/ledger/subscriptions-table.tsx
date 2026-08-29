import Link from "next/link";

import {
  cadenceLabel,
  formatDate,
  formatMoneyMinor,
  statusLabel,
  trustLabel,
} from "@/lib/subscriptions/format";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

export function SubscriptionsTable({ items }: { items: SubscriptionListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-stone-200 bg-white/80">
      <table className="min-w-[760px] w-full border-collapse text-left text-sm">
        <caption className="sr-only">Subscription records</caption>
        <thead className="border-b border-stone-200 bg-stone-50/80 text-xs uppercase tracking-[0.14em] text-stone-500">
          <tr>
            <th className="px-5 py-4 font-semibold" scope="col">Provider</th>
            <th className="px-5 py-4 font-semibold" scope="col">Plan</th>
            <th className="px-5 py-4 font-semibold" scope="col">Status</th>
            <th className="px-5 py-4 text-right font-semibold" scope="col">Amount</th>
            <th className="px-5 py-4 font-semibold" scope="col">Cadence</th>
            <th className="px-5 py-4 font-semibold" scope="col">Next renewal</th>
            <th className="px-5 py-4 font-semibold" scope="col">Field trust</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {items.map((item) => (
            <tr
              className={`transition hover:bg-emerald-50/50 ${
                item.needsAttention ? "bg-amber-50/80 hover:bg-amber-100/80" : ""
              }`}
              key={item.id}
            >
              <td className="px-5 py-4 align-top">
                <Link
                  className="font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700"
                  href={`/ledger/${item.id}`}
                >
                  {item.provider.value}
                </Link>
                {item.needsAttention ? (
                  <span className="mt-1 block text-xs font-semibold text-amber-800">
                    Needs attention
                  </span>
                ) : null}
              </td>
              <td className="px-5 py-4 align-top text-stone-700">{item.plan.value ?? "—"}</td>
              <td className="px-5 py-4 align-top text-stone-700">{statusLabel(item.status.value)}</td>
              <td className="px-5 py-4 text-right align-top tabular-nums text-stone-900">
                {item.amount.value
                  ? formatMoneyMinor(item.amount.value.minor, item.amount.value.currency)
                  : "—"}
              </td>
              <td className="px-5 py-4 align-top text-stone-700">{cadenceLabel(item.cadence.value)}</td>
              <td className="px-5 py-4 align-top tabular-nums text-stone-700">
                {formatDate(item.nextRenewal.value)}
              </td>
              <td className="px-5 py-4 align-top text-stone-600">{trustLabel(item)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
