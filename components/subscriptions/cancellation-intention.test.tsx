import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { emptyReminderPreferencesView } from "@/lib/reminders/preferences";
import type { SubscriptionDetail } from "@/lib/subscriptions/projection";

import { CancellationIntentionBlock } from "./cancellation-intention";

function detail(overrides: Partial<SubscriptionDetail> = {}): SubscriptionDetail {
  return {
    id: "00000000-0000-4000-8000-00000000a064",
    provider: { value: "Atlas Learning", status: "confirmed", confidence: "high" },
    plan: { value: "Annual", status: "empty", confidence: null },
    accountHint: null,
    status: { value: "active", status: "confirmed", confidence: "high" },
    amount: { value: { minor: 1200, currency: "GBP" }, status: "confirmed", confidence: "high" },
    cadence: { value: "monthly", status: "confirmed", confidence: "high" },
    nextRenewal: { value: "2026-10-12", status: "confirmed", confidence: "high" },
    trialEndsOn: { value: null, status: "empty", confidence: null },
    autoRenewal: { value: "yes", status: "confirmed", confidence: "high" },
    monthlyEquivalentMinor: 1200,
    updatedAt: "2026-09-14T00:00:00.000Z",
    startedOn: "2025-09-14",
    endsOn: null,
    notes: null,
    currency: "GBP",
    reminderPreferences: emptyReminderPreferencesView({
      cadence: "monthly",
      nextRenewal: "2026-10-12",
    }),
    cancellationIntention: null,
    amendments: [],
    events: [],
    ...overrides,
  };
}

describe("CancellationIntentionBlock", () => {
  it("offers Plan to cancel on a live holding", () => {
    const html = renderToStaticMarkup(
      <CancellationIntentionBlock detail={detail()} onSaved={() => undefined} />,
    );

    expect(html).toContain("Cancel plan");
    expect(html).toContain("Plan to cancel");
  });

  it("hides on cancelled and cancel_scheduled holdings", () => {
    for (const status of ["cancelled", "cancel_scheduled"] as const) {
      const html = renderToStaticMarkup(
        <CancellationIntentionBlock
          detail={detail({
            status: { value: status, status: "confirmed", confidence: "high" },
            cancellationIntention: { remindOn: "2026-10-01" },
          })}
          onSaved={() => undefined}
        />,
      );

      expect(html).toBe("");
    }
  });
});
