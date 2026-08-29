import Link from "next/link";
import { notFound } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import {
  cadenceLabel,
  fieldStatusLabel,
  formatDate,
  formatMoneyMinor,
  statusLabel,
} from "@/lib/subscriptions/format";
import { getSubscriptionDetail } from "@/lib/subscriptions/query";

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessionUser = await getSessionUser();
  const { id } = await params;

  if (!sessionUser.authenticated || !sessionUser.userId) {
    notFound();
  }

  const subscription = await getSubscriptionDetail(getDb(), {
    userId: sessionUser.userId,
    id,
  });

  if (!subscription) {
    notFound();
  }

  const terms = [
    {
      label: "Amount",
      value: subscription.amount.value
        ? formatMoneyMinor(subscription.amount.value.minor, subscription.amount.value.currency)
        : "—",
      status: subscription.amount.status,
    },
    {
      label: "Cadence",
      value: cadenceLabel(subscription.cadence.value),
      status: subscription.cadence.status,
    },
    {
      label: "Next renewal",
      value: formatDate(subscription.nextRenewal.value),
      status: subscription.nextRenewal.status,
    },
    {
      label: "Status",
      value: statusLabel(subscription.status.value),
      status: subscription.status.status,
    },
  ];

  return (
    <main className="min-h-screen px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <Link
          className="text-sm font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700"
          href="/ledger"
        >
          ← Back to ledger
        </Link>
        <header className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-800">
            Subscription record
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">
            {subscription.provider.value}
          </h1>
          <p className="mt-2 text-stone-600">{subscription.plan.value ?? "Plan not specified"}</p>
        </header>

        <section className="mt-10 rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-stone-950">Current terms</h2>
          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            {terms.map((term) => (
              <div key={term.label}>
                <dt className="text-sm text-stone-500">{term.label}</dt>
                <dd className="mt-1 font-medium text-stone-900">{term.value}</dd>
                <dd className="mt-1 text-xs text-stone-500">
                  Field status: {fieldStatusLabel(term.status)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-6 rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-stone-950">Activity</h2>
          <p className="mt-3 text-sm text-stone-600">No activity yet</p>
        </section>
      </div>
    </main>
  );
}
