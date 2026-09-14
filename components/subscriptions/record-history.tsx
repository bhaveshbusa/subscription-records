import { cadenceLabel, formatDate, formatMoneyMinor } from "@/lib/subscriptions/format";
import type { SubscriptionDetail } from "@/lib/subscriptions/projection";
import { timelineEntries } from "@/lib/subscriptions/timeline";

/**
 * Amendment history and the activity behind the current values. Reminder
 * preferences are edited on the open row, not here. Read-only, so the trust
 * and evidence behind a value stay inspectable next to the conversation.
 */
export function RecordHistory({ detail }: { detail: SubscriptionDetail }) {
  const activity = timelineEntries(detail);

  return (
    <>
      <section className="mt-6 rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-stone-950">Amendments</h2>
        {detail.amendments.length === 0 ? (
          <p className="mt-3 text-sm text-stone-600">No amendments recorded</p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-100">
            {detail.amendments.map((amendment) => (
              <li className="py-4 first:pt-0 last:pb-0" key={amendment.id}>
                <p className="text-sm font-semibold text-stone-900">
                  {formatDate(amendment.effectiveFrom)} –{" "}
                  {amendment.effectiveTo ? formatDate(amendment.effectiveTo) : "Open"}
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  {amendment.amountMinor !== null
                    ? formatMoneyMinor(amendment.amountMinor, amendment.currency)
                    : "Amount not set"}
                  {" · "}
                  {cadenceLabel(amendment.cadence)}
                  {" · "}
                  {amendment.plan ?? "Plan not specified"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-stone-950">Activity</h2>
        {activity.length === 0 ? (
          <p className="mt-3 text-sm text-stone-600">No activity yet</p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-100">
            {activity.map((entry) => (
              <li className="py-4 first:pt-0 last:pb-0" key={entry.key}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-stone-900">{entry.title}</span>
                  {entry.unconfirmed ? (
                    <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                      Unconfirmed
                    </span>
                  ) : null}
                  <span className="ml-auto text-sm tabular-nums text-stone-500">
                    {formatDate(entry.on)}
                  </span>
                </div>
                {entry.detail ? (
                  <p className="mt-1 text-sm text-stone-600">{entry.detail}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
