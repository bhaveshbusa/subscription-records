import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProposalCard } from "@/components/proposals/proposal-card";
import type { ProposalView } from "@/lib/proposals/projection";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

function field<T>(value: T | null, status: SubscriptionListItem["amount"]["status"] = "confirmed") {
  return { value, status, confidence: status === "confirmed" ? ("high" as const) : null };
}

function saved(): SubscriptionListItem {
  return {
    id: "sub-northstar-personal",
    provider: field("Northstar Notes"),
    plan: field("Plus"),
    accountHint: "personal@example.test",
    status: field("active" as const),
    amount: field({ minor: 1200, currency: "GBP" }),
    cadence: field("monthly" as const),
    nextRenewal: field("2026-10-12"),
    trialEndsOn: field(null, "empty"),
    autoRenewal: field("yes" as const),
    endsOn: null,
    monthlyEquivalentMinor: 1200,
    updatedAt: "2026-09-14T00:00:00.000Z",
  };
}

function proposal(overrides: Partial<ProposalView> & Pick<ProposalView, "kind" | "payload">): ProposalView {
  return {
    id: "proposal-1",
    state: "pending",
    subscriptionId: "sub-northstar-personal",
    subscriptionProvider: "Northstar Notes",
    rationale: "Synthetic fixture.",
    confidence: "medium",
    createdAt: "2026-09-14T00:00:00.000Z",
    decidedAt: null,
    appliable: true,
    payloadIssues: [],
    likelyMatches: [],
    draftScope: null,
    ...overrides,
  };
}

const idle = {
  busy: false,
  working: false,
  onDecide: () => undefined,
};

describe("ProposalCard integrated layout", () => {
  it("shows saved £12 beside proposed £15 and does not repeat the provider heading", () => {
    const html = renderToStaticMarkup(
      <ProposalCard
        {...idle}
        layout="integrated"
        proposal={proposal({
          kind: "update",
          payload: { amountMinor: { value: 1500, status: "proposed" }, currency: "GBP" },
        })}
        saved={saved()}
      />,
    );

    expect(html).toContain("Pending update");
    expect(html).toContain("Saved amount");
    expect(html).toContain("£12.00");
    expect(html).toContain("Proposed amount");
    expect(html).toContain("£15.00");
    expect(html).toContain("Accept");
    expect(html).not.toContain("Confirm amount");
    expect(html).not.toContain("Accept as proposed");
    expect(html).not.toContain("Northstar Notes</h2>");
    expect(html).not.toContain("Confirm cadence");
  });

  it("labels a create as a proposed draft and keeps missing renewal not recorded", () => {
    const html = renderToStaticMarkup(
      <ProposalCard
        {...idle}
        layout="integrated"
        onRetarget={() => undefined}
        proposal={proposal({
          id: "draft-cedar",
          kind: "create",
          subscriptionId: null,
          payload: {
            provider: { value: "Cedar Audio", status: "proposed" },
            plan: "Premium",
            amountMinor: { value: 800, status: "proposed" },
            cadence: { value: "monthly", status: "proposed" },
          },
        })}
        saved={null}
      />,
    );

    expect(html).toContain("Proposed draft");
    expect(html).toContain("Nothing saved");
    expect(html).toContain("£8.00");
    expect(html).toContain("Not recorded");
    expect(html).toContain("Wrong provider or account?");
    expect(html).not.toContain("Cedar Audio</h2>");
  });

  it("renders a pending cancellation as lifecycle status and end date, not an amount edit", () => {
    const html = renderToStaticMarkup(
      <ProposalCard
        {...idle}
        layout="integrated"
        proposal={proposal({
          kind: "cancelled",
          payload: {
            subscriptionStatus: { value: "cancelled", status: "proposed" },
            endsOn: "2026-10-12",
          },
        })}
        saved={saved()}
      />,
    );

        expect(html).toContain("Pending cancellation");
    expect(html).toContain("Cancelled");
    expect(html).toContain("12 Oct 2026");
    expect(html).not.toContain("Saved amount");
    expect(html).not.toContain("Confirm amount");
  });

  it("shows a recoverable decision failure next to Accept with shared Feedback", () => {
    const html = renderToStaticMarkup(
      <ProposalCard
        {...idle}
        error="We couldn't accept that proposal. Please try again."
        layout="integrated"
        proposal={proposal({
          kind: "update",
          payload: { amountMinor: { value: 1500, status: "proposed" }, currency: "GBP" },
        })}
        saved={saved()}
      />,
    );

        expect(html).toContain("ui-feedback--error");
    expect(html).toContain('role="alert"');
    expect(html).toContain("We couldn&#x27;t accept that proposal. Please try again.");
    expect(html).toContain("Accept");
  });
});
