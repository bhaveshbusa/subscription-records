import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EXPECTED_DATE_NOTE } from "@/lib/fields/review";
import { emptyReminderPreferencesView } from "@/lib/reminders/preferences";
import type { SubscriptionDetail } from "@/lib/subscriptions/projection";

import { RecordTerms } from "./record-terms";

function detail(overrides: Partial<SubscriptionDetail> = {}): SubscriptionDetail {
  return {
    id: "00000000-0000-4000-8000-00000000a074",
    provider: { value: "Atlas Learning", status: "confirmed", confidence: "high" },
    plan: { value: "Annual", status: "empty", confidence: null },
    accountHint: "personal@example.test",
    status: { value: "active", status: "confirmed", confidence: "high" },
    amount: { value: { minor: 1200, currency: "GBP" }, status: "inferred", confidence: "high" },
    cadence: { value: "monthly", status: "proposed", confidence: null },
    nextRenewal: { value: "2026-07-06", status: "confirmed", confidence: "high" },
    expectedNextRenewal: { value: "2026-10-06", status: "inferred", basis: "expected" },
    trialEndsOn: { value: null, status: "empty", confidence: null },
    autoRenewal: { value: "yes", status: "confirmed", confidence: "high" },
    monthlyEquivalentMinor: 1200,
    updatedAt: "2026-09-14T00:00:00.000Z",
    startedOn: "2025-09-14",
    endsOn: null,
    notes: "Synthetic compact-field fixture.",
    currency: "GBP",
    reminderPreferences: emptyReminderPreferencesView({
      cadence: "monthly",
      nextRenewal: "2026-07-06",
    }),
    amendments: [],
    events: [],
    ...overrides,
  };
}

describe("RecordTerms compact field anatomy", () => {
  it("groups amount and cadence, confirms only the named field, and keeps expected dates read-only", () => {
    const html = renderToStaticMarkup(<RecordTerms initial={detail()} />);

    expect(html).toContain('aria-label="Price and cadence"');
    expect(html).toContain("Confirm amount");
    expect(html).toContain("Confirm cadence");
    expect(html).not.toContain("Confirm recorded renewal");
    expect(html).toContain("Recorded renewal");
    expect(html).toContain("6 Jul 2026");
    expect(html).toContain("Expected next renewal");
    expect(html).toContain("6 Oct 2026");
    expect(html).toContain(EXPECTED_DATE_NOTE);
    expect(html).not.toContain("Confirm expected");
    expect(html).toContain("personal@example.test");
    expect(html).toContain("Inferred");
    expect(html).toContain("Proposed");
    expect(html).toContain("Notes, dates and supporting details");
    expect(html).not.toContain(">Details</h2>");
    expect(html).toContain("Trial ends on");
  });

  it("labels trial paid terms after trial and leaves missing money unknown", () => {
    const html = renderToStaticMarkup(
      <RecordTerms
        initial={detail({
          status: { value: "trial", status: "confirmed", confidence: "high" },
          amount: { value: { minor: 1800, currency: "GBP" }, status: "proposed", confidence: null },
          cadence: { value: "monthly", status: "proposed", confidence: null },
          expectedNextRenewal: undefined,
          trialEndsOn: { value: "2026-09-28", status: "proposed", confidence: null },
          autoRenewal: { value: null, status: "empty", confidence: null },
        })}
      />,
    );

    expect(html).toContain("Amount after trial");
    expect(html).toContain("Confirm amount after trial");
    expect(html).toContain("Cadence after trial");
    expect(html).toContain("Trial ends on");
    expect(html).toContain("Not recorded");
    expect(html).not.toContain("£0.00");
  });

  it("does not offer Confirm on a confirmed amount, only Edit", () => {
    const html = renderToStaticMarkup(
      <RecordTerms
        initial={detail({
          amount: { value: { minor: 1200, currency: "GBP" }, status: "confirmed", confidence: "high" },
          cadence: { value: "monthly", status: "confirmed", confidence: "high" },
          expectedNextRenewal: undefined,
        })}
      />,
    );

    expect(html).not.toContain("Confirm amount");
    expect(html).toContain('aria-label="Edit Amount"');
  });

  it("offers inline Edit on Status instead of only Edit everything", () => {
    const html = renderToStaticMarkup(<RecordTerms initial={detail()} />);

    expect(html).toContain('aria-label="Edit Status"');
    expect(html).toContain("Edit everything");
    expect(html).toContain("Ordinary status changes save status only");
    expect(html).not.toContain("To change status, or end or restart this subscription");
  });
});
