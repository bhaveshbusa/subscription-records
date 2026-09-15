import { describe, expect, it } from "vitest";

import type { ProposalView } from "@/lib/proposals/projection";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

import {
  groupInlineProposals,
  proposalAnchor,
  proposalKindHeading,
  proposalPresentation,
  termDifferences,
} from "./differences";

function field<T>(value: T | null, status: SubscriptionListItem["amount"]["status"] = "confirmed") {
  return { value, status, confidence: status === "confirmed" ? ("high" as const) : null };
}

function saved(overrides: Partial<SubscriptionListItem> = {}): SubscriptionListItem {
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
    ...overrides,
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

describe("proposal presentation", () => {
  it("keeps lifecycle and charge cards out of ordinary field correction", () => {
    expect(
      proposalPresentation(
        proposal({
          kind: "cancelled",
          payload: { subscriptionStatus: { value: "cancelled", status: "proposed" } },
        }),
      ),
    ).toBe("lifecycle");
    expect(
      proposalPresentation(
        proposal({
          kind: "charged",
          payload: {
            charge: {
              paidOn: "2026-09-01",
              amountMinor: 1200,
              currency: "GBP",
              idempotencyKey: "seed-charge",
            },
          },
        }),
      ),
    ).toBe("charge");
    expect(termDifferences(proposal({
      kind: "cancelled",
      payload: { subscriptionStatus: { value: "cancelled", status: "proposed" } },
    }), saved())).toEqual([]);
  });

  it("labels a create as a proposed draft and an update as a pending update", () => {
    const draft = proposal({
      kind: "create",
      subscriptionId: null,
      payload: {
        provider: { value: "Cedar Audio", status: "proposed" },
        amountMinor: { value: 800, status: "proposed" },
        cadence: { value: "monthly", status: "proposed" },
      },
    });

    expect(proposalKindHeading(draft)).toBe("Proposed draft");
    expect(proposalKindHeading(proposal({
      kind: "update",
      payload: { amountMinor: { value: 1500, status: "proposed" }, currency: "GBP" },
    }))).toBe("Pending update");
  });
});

describe("termDifferences", () => {
  it("shows the saved amount beside a proposed amount and omits unchanged cadence", () => {
    const differences = termDifferences(
      proposal({
        kind: "update",
        payload: { amountMinor: { value: 1500, status: "proposed" }, currency: "GBP" },
      }),
      saved(),
    );

    expect(differences).toEqual([
      expect.objectContaining({
        field: "amount",
        savedLabel: "Saved amount",
        savedValue: "£12.00",
        savedHasValue: true,
        savedStatus: "confirmed",
        proposedLabel: "Proposed amount",
        proposedValue: "£15.00",
        proposedHasValue: true,
        proposedStatus: "proposed",
      }),
    ]);
  });

  it("labels a draft's missing saved side and does not invent a renewal", () => {
    const differences = termDifferences(
      proposal({
        kind: "create",
        subscriptionId: null,
        payload: {
          provider: { value: "Cedar Audio", status: "proposed" },
          plan: "Premium",
          amountMinor: { value: 800, status: "proposed" },
          cadence: { value: "monthly", status: "proposed" },
        },
      }),
      null,
    );

    expect(differences.map((difference) => difference.field)).toEqual([
      "provider",
      "plan",
      "amount",
      "cadence",
      "nextRenewal",
    ]);
    expect(differences.find((difference) => difference.field === "amount")).toMatchObject({
      savedLabel: "Not yet added amount",
      savedValue: "Nothing saved",
      proposedLabel: "Proposed draft amount",
      proposedValue: "£8.00",
    });
    expect(differences.find((difference) => difference.field === "nextRenewal")).toMatchObject({
      proposedValue: "Not recorded",
      proposedHasValue: false,
      proposedStatus: "empty",
    });
  });

  it("keeps stacked amount updates under amount and cancel in rest (legacy stacks)", () => {
    const first = proposal({
      id: "proposal-amount",
      kind: "update",
      payload: { amountMinor: { value: 1500, status: "proposed" }, currency: "GBP" },
    });
    const second = proposal({
      id: "proposal-amount-again",
      kind: "update",
      payload: { amountMinor: { value: 1800, status: "proposed" }, currency: "GBP" },
    });
    const cancel = proposal({
      id: "proposal-cancel",
      kind: "cancelled",
      payload: {
        subscriptionStatus: { value: "cancelled", status: "proposed" },
        endsOn: "2026-10-01",
      },
    });
    const grouped = groupInlineProposals([first, second, cancel]);

    expect(proposalAnchor(first)).toBe("amount");
    expect(grouped.inline.amount?.map((item) => item.id)).toEqual([
      "proposal-amount",
      "proposal-amount-again",
    ]);
    expect(grouped.rest.map((item) => item.id)).toEqual(["proposal-cancel"]);
  });

  it("anchors a multi-field amount+cadence update to amount for the price group slot", () => {
    const multi = proposal({
      id: "proposal-multi",
      kind: "update",
      payload: {
        amountMinor: { value: 1500, status: "proposed" },
        currency: "GBP",
        cadence: { value: "yearly", status: "proposed" },
      },
    });

    expect(proposalAnchor(multi)).toBe("amount");
    expect(groupInlineProposals([multi]).inline.amount?.map((item) => item.id)).toEqual([
      "proposal-multi",
    ]);
  });
});
