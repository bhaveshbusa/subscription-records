import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { emptyReminderPreferencesView, toReminderPreferencesView } from "@/lib/reminders/preferences";
import type { SubscriptionDetail } from "@/lib/subscriptions/projection";

import { ReminderPreferences, showTrialEndReminder } from "./reminder-preferences";

function detail(overrides: Partial<SubscriptionDetail> = {}): SubscriptionDetail {
  return {
    id: "00000000-0000-4000-8000-00000000a076",
    provider: { value: "Atlas Learning", status: "confirmed", confidence: "high" },
    plan: { value: "Annual", status: "empty", confidence: null },
    accountHint: "personal@example.test",
    status: { value: "active", status: "confirmed", confidence: "high" },
    amount: { value: { minor: 1200, currency: "GBP" }, status: "inferred", confidence: "high" },
    cadence: { value: "monthly", status: "proposed", confidence: null },
    nextRenewal: { value: "2026-10-12", status: "confirmed", confidence: "high" },
    trialEndsOn: { value: null, status: "empty", confidence: null },
    autoRenewal: { value: "yes", status: "confirmed", confidence: "high" },
    monthlyEquivalentMinor: 1200,
    updatedAt: "2026-09-14T00:00:00.000Z",
    startedOn: "2025-09-14",
    endsOn: null,
    notes: "Synthetic reminder-preference fixture.",
    currency: "GBP",
    reminderPreferences: emptyReminderPreferencesView({
      cadence: "monthly",
      nextRenewal: "2026-10-12",
      today: "2026-09-14",
    }),
    amendments: [],
    events: [],
    ...overrides,
  };
}

describe("ReminderPreferences", () => {
  it("shows Set on an unset renewal and does not apply the monthly-off suggestion", () => {
    const html = renderToStaticMarkup(
      <ReminderPreferences detail={detail()} onSaved={() => undefined} />,
    );

    expect(html).toContain('id="reminders-00000000-0000-4000-8000-00000000a076"');
    expect(html).toContain("Renewal reminder");
    expect(html).toContain("Not set");
    expect(html).toContain("Not set. You will not be reminded until you choose.");
    expect(html).toContain("Suggested: off. Not applied until you choose it.");
    expect(html).toContain("Use this suggestion");
    expect(html).toContain('aria-label="Set Renewal reminder"');
    expect(html).not.toContain("Dismiss");
    expect(html).not.toContain("Snooze");
    expect(html).not.toContain("Mark as read");
    expect(html).not.toContain("Trial-end reminder");
  });

  it("shows Edit on an enabled yearly preference that already matches the suggestion", () => {
    const html = renderToStaticMarkup(
      <ReminderPreferences
        detail={detail({
          cadence: { value: "yearly", status: "confirmed", confidence: "high" },
          reminderPreferences: toReminderPreferencesView({
            cadence: "yearly",
            nextRenewal: "2026-10-12",
            trialEndsOn: null,
            rows: [{ target: "renewal", state: "enabled", leadValue: 1, leadUnit: "months" }],
            today: "2026-09-14",
          }),
        })}
        onSaved={() => undefined}
      />,
    );

    expect(html).toContain("Enabled · 1 month before");
    expect(html).toContain('aria-label="Edit Renewal reminder"');
    expect(html).not.toContain("Use this suggestion");
  });

  it("shows Off as a stored choice distinct from Not set", () => {
    const html = renderToStaticMarkup(
      <ReminderPreferences
        detail={detail({
          reminderPreferences: toReminderPreferencesView({
            cadence: "monthly",
            nextRenewal: "2026-10-12",
            trialEndsOn: null,
            rows: [{ target: "renewal", state: "off", leadValue: null, leadUnit: null }],
            today: "2026-09-14",
          }),
        })}
        onSaved={() => undefined}
      />,
    );

    expect(html).toContain(">Off</span>");
    expect(html).toContain("Off. You will not be reminded.");
    expect(html).toContain('aria-label="Edit Renewal reminder"');
    expect(html).not.toContain(">Not set</span>");
  });

  it("explains a missing date while still offering Edit", () => {
    const html = renderToStaticMarkup(
      <ReminderPreferences
        detail={detail({
          nextRenewal: { value: null, status: "empty", confidence: null },
          expectedNextRenewal: undefined,
          reminderPreferences: toReminderPreferencesView({
            cadence: "yearly",
            nextRenewal: null,
            trialEndsOn: null,
            rows: [{ target: "renewal", state: "enabled", leadValue: 1, leadUnit: "months" }],
            today: "2026-09-14",
          }),
        })}
        onSaved={() => undefined}
      />,
    );

    expect(html).toContain("Enabled, but there is no date yet so no reminder can be shown.");
    expect(html).toContain('aria-label="Edit Renewal reminder"');
  });

  it("shows trial-end when the holding is a trial, has a trial end, or already stores that preference", () => {
    const active = detail();
    expect(showTrialEndReminder(active)).toBe(false);

    expect(
      showTrialEndReminder(
        detail({ status: { value: "trial", status: "confirmed", confidence: "high" } }),
      ),
    ).toBe(true);
    expect(
      showTrialEndReminder(
        detail({ trialEndsOn: { value: "2026-09-28", status: "proposed", confidence: null } }),
      ),
    ).toBe(true);
    expect(
      showTrialEndReminder(
        detail({
          reminderPreferences: toReminderPreferencesView({
            cadence: "monthly",
            nextRenewal: "2026-10-12",
            trialEndsOn: null,
            rows: [{ target: "trial_end", state: "off", leadValue: null, leadUnit: null }],
            today: "2026-09-14",
          }),
        }),
      ),
    ).toBe(true);
    expect(showTrialEndReminder(active, true)).toBe(true);

    const html = renderToStaticMarkup(
      <ReminderPreferences
        detail={detail({
          status: { value: "trial", status: "confirmed", confidence: "high" },
          trialEndsOn: { value: "2026-09-28", status: "proposed", confidence: null },
        })}
        onSaved={() => undefined}
      />,
    );

    expect(html).toContain("Trial-end reminder");
    expect(html).toContain('aria-label="Set Trial-end reminder"');
  });
});
