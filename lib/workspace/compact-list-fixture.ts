import type { FieldStatus } from "@/lib/subscriptions/projection";
import type { ProposalView } from "@/lib/proposals/projection";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

import type { SubscriptionEntry } from "./subscription-list";

function field<T>(value: T | null, status: FieldStatus = "confirmed") {
  return {
    value,
    status,
    confidence: status === "confirmed" || status === "inferred" ? ("high" as const) : null,
  };
}

function item(
  id: string,
  provider: string,
  overrides: Partial<SubscriptionListItem> = {},
): SubscriptionListItem {
  return {
    id,
    provider: field(provider),
    plan: field("Standard"),
    accountHint: null,
    status: field("active" as const),
    amount: field({ minor: 900, currency: "GBP" }),
    cadence: field("monthly" as const),
    nextRenewal: field("2026-10-12"),
    trialEndsOn: field(null, "empty"),
    autoRenewal: field(null, "empty"),
    endsOn: null,
    monthlyEquivalentMinor: 900,
    updatedAt: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

function draftProposal(
  id: string,
  provider: string,
  accountHint: string | null,
  extras: Partial<NonNullable<ProposalView["payload"]>> = {},
): ProposalView {
  return {
    id,
    kind: "create",
    state: "pending",
    subscriptionId: null,
    subscriptionProvider: null,
    rationale: "Synthetic compact-list fixture. Nothing here is a real subscription.",
    confidence: null,
    createdAt: "2026-09-14T00:00:00.000Z",
    decidedAt: null,
    appliable: true,
    payload: {
      provider: { value: provider, status: "proposed" },
      ...(accountHint ? { accountHint } : {}),
      plan: "Premium",
      currency: "GBP",
      amountMinor: { value: 800, status: "proposed" },
      cadence: { value: "monthly", status: "proposed" },
      ...extras,
    },
    payloadIssues: [],
    likelyMatches: [],
    draftScope: accountHint ? `draft:${provider.toLowerCase()}|${accountHint}` : `draft:${provider.toLowerCase()}|`,
  };
}

function saved(
  row: SubscriptionListItem,
): SubscriptionEntry {
  return {
    key: row.id,
    kind: "saved",
    subscriptionId: row.id,
    item: row,
    provider: row.provider.value ?? "Unknown provider",
    draft: null,
    proposals: [],
    questions: [],
    reminders: [],
    reasons: [],
  };
}

function draft(proposal: ProposalView): SubscriptionEntry {
  return {
    key: `draft:${proposal.id}`,
    kind: "draft",
    subscriptionId: null,
    item: null,
    provider: proposal.payload?.provider?.value ?? "Unknown provider",
    draft: proposal,
    proposals: [proposal],
    questions: [],
    reminders: [],
    reasons: [],
  };
}

const FILLERS = [
  "Willow Reader",
  "Orbit Calendar",
  "Meadow Fitness",
  "Pine Video",
  "Brook Passwords",
  "Beacon Tasks",
  "Moss Language",
  "Cove Storage",
  "Maple Music",
  "Lake Publishing",
  "Fern Recipes",
  "Slate Research",
  "Dawn Journaling",
  "Reed Drawing",
  "Pebble Weather",
  "Birch Books",
  "Opal Travel",
] as const;

/**
 * Twenty-five synthetic rows for compact-list review: two accounts of one
 * provider, two independent drafts, a long name, trial/active/cancelled,
 * missing terms, and a distinct expected date. No private evidence.
 */
export function compactListFixture(): SubscriptionEntry[] {
  const northstarPersonal = saved(
    item("sub-northstar-personal", "Northstar Notes", {
      plan: field("Plus"),
      accountHint: "personal@example.test",
      amount: field({ minor: 1200, currency: "GBP" }),
      monthlyEquivalentMinor: 1200,
      nextRenewal: field("2026-10-12"),
    }),
  );
  const northstarStudio = saved(
    item("sub-northstar-studio", "Northstar Notes", {
      plan: field("Team"),
      accountHint: "studio-billing-contact-with-a-very-long-identifier@example.test",
      amount: field({ minor: 2400, currency: "GBP" }),
      monthlyEquivalentMinor: 2400,
      nextRenewal: field("2026-09-18"),
    }),
  );
  const harbor = saved(
    item("sub-harbor", "Harbor Design Library and Collaboration Studio", {
      plan: field("Professional"),
      accountHint: "studio@example.test",
      status: field("trial" as const),
      amount: field({ minor: 1800, currency: "GBP" }),
      monthlyEquivalentMinor: 1800,
      nextRenewal: field(null, "empty"),
      trialEndsOn: field("2026-09-21", "proposed"),
    }),
  );
  const juniper = saved(
    item("sub-juniper", "Juniper Cloud", {
      plan: field("Storage"),
      amount: field(null, "empty"),
      cadence: field(null, "empty"),
      nextRenewal: field(null, "empty"),
      monthlyEquivalentMinor: null,
    }),
  );
  const atlas = saved(
    item("sub-atlas", "Atlas Learning", {
      plan: field("Annual"),
      accountHint: "personal@example.test",
      amount: field({ minor: 9600, currency: "GBP" }),
      cadence: field("yearly" as const),
      monthlyEquivalentMinor: 800,
      nextRenewal: field("2026-01-31"),
      autoRenewal: field("yes" as const),
      expectedNextRenewal: { value: "2026-10-31", status: "inferred", basis: "expected" },
    }),
  );
  const summit = saved(
    item("sub-summit", "Summit Maps", {
      status: field("cancelled" as const),
      amount: field({ minor: 2300, currency: "GBP" }),
      nextRenewal: field(null, "empty"),
      endsOn: "2026-08-01",
      monthlyEquivalentMinor: 2300,
    }),
  );
  const cedarPersonal = draft(
    draftProposal("draft-cedar-personal", "Cedar Audio", "personal@example.test"),
  );
  const cedarFamily = draft(
    draftProposal("draft-cedar-family", "Cedar Audio", "family@example.test", {
      amountMinor: { value: 1200, status: "proposed" },
    }),
  );

  const fillers = FILLERS.map((name, index) =>
    saved(
      item(`sub-filler-${index + 1}`, name, {
        amount: field({ minor: (index + 5) * 100, currency: "GBP" }),
        monthlyEquivalentMinor: (index + 5) * 100,
        nextRenewal: field(`2026-10-${String(index + 1).padStart(2, "0")}`),
      }),
    ),
  );

  return [
    northstarPersonal,
    northstarStudio,
    cedarPersonal,
    cedarFamily,
    harbor,
    juniper,
    atlas,
    summit,
    ...fillers,
  ];
}
