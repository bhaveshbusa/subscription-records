import {
  cadenceLabel,
  formatDate,
  formatMoneyMinor,
  reminderConsentLabel,
  reminderLeadLabel,
} from "@/lib/subscriptions/format";
import type { ReminderPreferenceView } from "@/lib/reminders/preferences";
import type { SubscriptionDetail } from "@/lib/subscriptions/projection";
import { timelineEntries } from "@/lib/subscriptions/timeline";

function reminderPreviewCopy(
  preference: ReminderPreferenceView,
  expectedDue: boolean,
): string {
  const { preview } = preference;
  const expectedNote = expectedDue
    ? " The due date is the expected next renewal (inferred)."
    : "";

  if (preference.state === "unset") {
    return "Unset. You will not be reminded until you choose.";
  }

  if (preference.state === "off") {
    return "Off. You will not be reminded.";
  }

  if (preview.occurrence === "unknown") {
    return "Enabled, but there is no date yet so no reminder can be shown.";
  }

  if (preview.occurrence === "past") {
    return `The occurrence for ${formatDate(preview.dueDate)} has passed (would have started ${formatDate(preview.reminderDate)}).${expectedNote}`;
  }

  if (preview.occurrence === "upcoming") {
    return `Work would show this from ${formatDate(preview.reminderDate)} through ${formatDate(preview.dueDate)}.${expectedNote}`;
  }

  return `Work would show this now, from ${formatDate(preview.reminderDate)} through ${formatDate(preview.dueDate)}.${expectedNote}`;
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

/**
 * What the record has been: reminder consent as stored, the amendment history,
 * and the activity behind the current values. Read-only, so the trust and
 * evidence behind a value stay inspectable next to the conversation about it.
 */
export function RecordHistory({ detail }: { detail: SubscriptionDetail }) {
  const activity = timelineEntries(detail);

  return (
    <>
      <section className="mt-6 rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-stone-950">Reminders</h2>
        <p className="mt-2 text-sm text-stone-600">
          Reminders appear in Work. They are independent of auto-renewal, and turning a
          preference off is not the same as dismissing a card.
        </p>
        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          <ReminderPreferenceReadout
            expectedDue={Boolean(detail.expectedNextRenewal)}
            preference={detail.reminderPreferences.renewal}
            title="Renewal"
          />
          <ReminderPreferenceReadout
            preference={detail.reminderPreferences.trialEnd}
            title="Trial end"
          />
        </dl>
      </section>

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
