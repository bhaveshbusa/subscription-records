import Link from "next/link";

import {
  cadenceLabel,
  formatDate,
  formatMoneyMinor,
  reminderTargetLabel,
  statusLabel,
} from "@/lib/subscriptions/format";
import { reasonDetail, type SubscriptionEntry } from "@/lib/workspace/subscription-list";
import type { WorkspaceFilter } from "@/lib/workspace/view";

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The one line under the name that says why the row is in this filter — the
 * question asked, the card waiting, the date a reminder is for. Under All the
 * inventory stays plain: no attention chip on a saved holding.
 */
function context(entry: SubscriptionEntry, filter: WorkspaceFilter): string | null {
  switch (filter) {
    case "all":
      return null;
    case "reviews": {
      const parts: string[] = [];

      if (entry.kind === "draft") {
        const account = entry.draft?.payload?.accountHint;

        parts.push(account ? `Card waiting · ${account}` : "Card waiting");
      } else if (entry.proposals.length > 0) {
        parts.push(count(entry.proposals.length, "proposed change", "proposed changes"));
      }

      if (entry.item) {
        const item = entry.item;

        parts.push(...entry.reasons.map((reason) => reasonDetail(item, reason)));
      }

      return parts.join(" · ") || null;
    }
    case "questions": {
      const [first] = entry.questions;

      if (!first) {
        return null;
      }

      const more = entry.questions.length - 1;

      return more > 0 ? `${first.question} · ${count(more, "more question", "more questions")}` : first.question;
    }
    case "reminders": {
      const [first] = entry.reminders;

      return first
        ? `${reminderTargetLabel(first.target)} due ${formatDate(first.dueDate)}`
        : null;
    }
  }
}

/**
 * One subscription or draft as a closed row: enough to recognise it, its own
 * cost and dates as recorded, and a line about why it is under this filter.
 * Clicking the name opens it inline through a link, so the open row is in the
 * URL and a reload or a shared link lands on it.
 */
export function SubscriptionRow({
  entry,
  filter,
  href,
  open,
}: {
  entry: SubscriptionEntry;
  filter: WorkspaceFilter;
  /** Where the name opens — or closes — this row. */
  href: string;
  open: boolean;
}) {
  const item = entry.item;
  const draft = entry.draft?.payload ?? null;
  const amount = item?.amount.value
    ? formatMoneyMinor(item.amount.value.minor, item.amount.value.currency)
    : draft?.amountMinor && draft.currency
      ? formatMoneyMinor(draft.amountMinor.value, draft.currency)
      : null;
  const cadence = cadenceLabel(item?.cadence.value ?? draft?.cadence?.value ?? null);
  const plan = item?.plan.value ?? draft?.plan ?? null;
  const status = item ? statusLabel(item.status.value) : null;
  const expected =
    item?.expectedNextRenewal && item.expectedNextRenewal.value !== item.nextRenewal.value
      ? item.expectedNextRenewal.value
      : null;
  const line = context(entry, filter);

  return (
    <div
      aria-current={open ? "true" : undefined}
      className={
        open
          ? "flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 bg-white px-4 py-4 sm:px-6"
          : "flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 py-4 transition hover:bg-white/70 sm:px-6"
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link
            aria-expanded={open}
            className="font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700"
            href={href}
            scroll={false}
          >
            {entry.provider}
          </Link>
          {entry.kind === "draft" ? (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
              Not added yet
            </span>
          ) : status ? (
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
              {status}
            </span>
          ) : null}
          {plan ? <span className="text-sm text-stone-600">{plan}</span> : null}
        </div>
        {line ? <p className="mt-1 text-sm text-stone-700">{line}</p> : null}
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-700">
        <div>
          <dt className="sr-only">Amount</dt>
          <dd>
            {amount ?? <span className="text-stone-400">Amount unknown</span>}
            {amount && cadence ? <span className="text-stone-500"> · {cadence}</span> : null}
          </dd>
        </div>
        {item ? (
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-stone-500">Next renewal</dt>
            <dd>
              {item.nextRenewal.value ? (
                formatDate(item.nextRenewal.value)
              ) : (
                <span className="text-stone-400">Not recorded</span>
              )}
              {expected ? (
                <span className="text-stone-500"> · expected {formatDate(expected)}</span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
