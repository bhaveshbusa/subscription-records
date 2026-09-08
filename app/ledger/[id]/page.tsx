import Link from "next/link";
import { notFound } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import {
  amountFieldLabel,
  autoRenewalLabel,
  cadenceFieldLabel,
  cadenceLabel,
  formatDate,
  formatMoneyMinor,
  reminderConsentLabel,
  reminderLeadLabel,
  statusLabel,
} from "@/lib/subscriptions/format";
import type { ReminderPreferenceView } from "@/lib/reminders/preferences";
import { getSubscriptionDetail } from "@/lib/subscriptions/query";
import { timelineEntries } from "@/lib/subscriptions/timeline";

import { FieldStatusBadge } from "../field-status-badge";

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
      label: "Provider",
      value: subscription.provider.value ?? "—",
      status: subscription.provider.status,
    },
    {
      label: "Plan",
      value: subscription.plan.value ?? "—",
      status: subscription.plan.status,
    },
    {
      label: "Status",
      value: statusLabel(subscription.status.value),
      status: subscription.status.status,
    },
    {
      label: amountFieldLabel(subscription.status.value),
      value: subscription.amount.value
        ? formatMoneyMinor(subscription.amount.value.minor, subscription.amount.value.currency)
        : "—",
      status: subscription.amount.status,
    },
    {
      label: cadenceFieldLabel(subscription.status.value),
      value: cadenceLabel(subscription.cadence.value),
      status: subscription.cadence.status,
    },
    {
      label: "Next renewal",
      value: formatDate(subscription.nextRenewal.value),
      status: subscription.nextRenewal.status,
    },
    ...(subscription.expectedNextRenewal
      ? [
          {
            label: "Expected next renewal",
            value: `${formatDate(subscription.expectedNextRenewal.value)} (inferred / expected)`,
            status: subscription.expectedNextRenewal.status,
          },
        ]
      : []),
    {
      label: "Trial ends on",
      value: formatDate(subscription.trialEndsOn.value),
      status: subscription.trialEndsOn.status,
    },
    {
      label: "Auto-renewal",
      value: autoRenewalLabel(subscription.autoRenewal.value),
      status: subscription.autoRenewal.status,
    },
  ];

  const details = [
    { label: "Account hint", value: subscription.accountHint ?? "—" },
    { label: "Started on", value: formatDate(subscription.startedOn) },
    { label: "Ends on", value: formatDate(subscription.endsOn) },
    { label: "Notes", value: subscription.notes ?? "—" },
  ];

  const activity = timelineEntries(subscription);

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
          <Link
            className="mt-6 inline-flex rounded-xl bg-emerald-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
            href={`/ledger/${subscription.id}/edit`}
          >
            Edit record
          </Link>
        </header>

        <section className="mt-10 rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-stone-950">Current terms</h2>
          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            {terms.map((term) => (
              <div key={term.label}>
                <dt className="text-sm text-stone-500">{term.label}</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-medium text-stone-900">{term.value}</span>
                  <FieldStatusBadge status={term.status} />
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-6 rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-stone-950">Reminders</h2>
          <p className="mt-2 text-sm text-stone-600">
            Reminders appear in Inbox. They are independent of auto-renewal. Turning a
            preference off is not the same as dismissing a card.
          </p>
          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            <ReminderPreferenceReadout
              expectedDue={Boolean(subscription.expectedNextRenewal)}
              preference={subscription.reminderPreferences.renewal}
              title="Renewal"
            />
            <ReminderPreferenceReadout
              preference={subscription.reminderPreferences.trialEnd}
              title="Trial end"
            />
          </dl>
        </section>

        <section className="mt-6 rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-stone-950">Details</h2>
          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label}>
                <dt className="text-sm text-stone-500">{detail.label}</dt>
                <dd className="mt-1 font-medium text-stone-900">{detail.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-6 rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-stone-950">Amendments</h2>
          {subscription.amendments.length === 0 ? (
            <p className="mt-3 text-sm text-stone-600">No amendments recorded</p>
          ) : (
            <ul className="mt-4 divide-y divide-stone-100">
              {subscription.amendments.map((amendment) => (
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
      </div>
    </main>
  );
}

function reminderPreviewCopy(
  preference: ReminderPreferenceView,
  expectedDue: boolean,
): string {
  const { preview } = preference;
  const expectedNote = expectedDue
    ? " The due date is the expected next renewal (inferred)."
    : "";

  if (preference.state === "unset") {
    return "Unset. Inbox will not remind you until you choose.";
  }

  if (preference.state === "off") {
    return "Off. Inbox will not remind you.";
  }

  if (preview.occurrence === "unknown") {
    return "Enabled, but there is no date yet so Inbox cannot show a reminder.";
  }

  if (preview.occurrence === "past") {
    return `The occurrence for ${formatDate(preview.dueDate)} has passed (would have started ${formatDate(preview.reminderDate)}).${expectedNote}`;
  }

  if (preview.occurrence === "upcoming") {
    return `Inbox would show this from ${formatDate(preview.reminderDate)} through ${formatDate(preview.dueDate)}.${expectedNote}`;
  }

  return `Inbox would show this now, from ${formatDate(preview.reminderDate)} through ${formatDate(preview.dueDate)}.${expectedNote}`;
}

function ReminderPreferenceReadout({
  title,
  preference,
  expectedDue = false,
}: {
  title: string;
  preference: ReminderPreferenceView;
  expectedDue?: boolean;
}) {
  return (
    <div>
      <dt className="text-sm text-stone-500">{title}</dt>
      <dd className="mt-1 font-medium text-stone-900">
        {reminderConsentLabel(preference.state)}
        {preference.state === "enabled"
          ? ` · ${reminderLeadLabel(preference.leadValue, preference.leadUnit)}`
          : null}
      </dd>
      <p className="mt-1 text-sm font-normal text-stone-600">
        {reminderPreviewCopy(preference, expectedDue)}
      </p>
    </div>
  );
}
