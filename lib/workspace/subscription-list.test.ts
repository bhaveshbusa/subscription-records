import { describe, expect, it } from "vitest";

import type { InboxQuestion, InboxReminder, InboxSections } from "@/lib/inbox/query";
import type { ProposalView } from "@/lib/proposals/projection";
import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

import {
  buildSubscriptionEntries,
  filterCounts,
  findEntry,
  matchesFilter,
  openEntry,
  visibleEntries,
} from "./subscription-list";

function field<T>(value: T | null) {
  return { value, status: "proposed" as const, confidence: null };
}

function item(id: string, provider: string): SubscriptionListItem {
  return {
    id,
    provider: field(provider),
    plan: field(null),
    status: field("active" as const),
    amount: field(null),
    cadence: field(null),
    nextRenewal: field(null),
    trialEndsOn: field(null),
    autoRenewal: field(null),
    endsOn: null,
    monthlyEquivalentMinor: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function proposal(overrides: Partial<ProposalView> & { id: string }): ProposalView {
  return {
    kind: "create",
    state: "pending",
    subscriptionId: null,
    subscriptionProvider: null,
    rationale: null,
    confidence: null,
    createdAt: "2026-01-03T00:00:00.000Z",
    decidedAt: null,
    appliable: true,
    payload: { provider: { value: "Readwise", status: "proposed" } },
    payloadIssues: [],
    likelyMatches: [],
    draftScope: null,
    ...overrides,
  };
}

function question(overrides: Partial<InboxQuestion> & { id: string }): InboxQuestion {
  return {
    provider: "Readwise",
    reason: "duplicate",
    state: "asked",
    question: "Is this the Readwise you already hold?",
    subscriptionId: null,
    scopeKey: "draft:readwise|",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function reminder(target: SubscriptionListItem, dueDate: string): InboxReminder {
  return {
    id: `${target.id}:renewal`,
    subscriptionId: target.id,
    target: "renewal",
    dueDate,
    reminderDate: "2026-01-01",
    basis: "recorded",
    status: "confirmed",
    item: target,
  };
}

function sections(overrides: Partial<InboxSections> = {}): InboxSections {
  return { overdue: [], unfinished: [], reminders: [], questions: [], ...overrides };
}

const NETFLIX = item("sub-netflix", "Netflix");
const SPOTIFY = item("sub-spotify", "Spotify");
const ICLOUD = item("sub-icloud", "iCloud");

function build(input: Partial<Parameters<typeof buildSubscriptionEntries>[0]> = {}) {
  return buildSubscriptionEntries({
    items: [NETFLIX, SPOTIFY],
    proposals: [],
    sections: sections(),
    ...input,
  });
}

describe("buildSubscriptionEntries", () => {
  it("lists the saved inventory in the order the server gave it", () => {
    expect(build().map((entry) => entry.key)).toEqual(["sub-netflix", "sub-spotify"]);
  });

  it("folds a pending update onto the holding it is about", () => {
    const update = proposal({
      id: "p-update",
      kind: "update",
      subscriptionId: "sub-netflix",
      subscriptionProvider: "Netflix",
      payload: { amountMinor: { value: 1299, status: "proposed" } },
    });
    const [netflix] = build({ proposals: [update] });

    expect(netflix.proposals).toEqual([update]);
    expect(netflix.kind).toBe("saved");
    expect(netflix.item).toBe(NETFLIX);
  });

  it("keeps a new draft as its own entry, not a holding", () => {
    const draft = proposal({ id: "p-readwise" });
    const entries = build({ proposals: [draft] });
    const readwise = entries.find((entry) => entry.kind === "draft");

    expect(entries).toHaveLength(3);
    expect(readwise).toMatchObject({
      key: "draft:p-readwise",
      subscriptionId: null,
      item: null,
      provider: "Readwise",
      draft,
    });
  });

  it("does not merge two drafts of one provider", () => {
    const entries = build({
      proposals: [
        proposal({ id: "p-1", payload: { provider: { value: "Adobe", status: "proposed" } } }),
        proposal({ id: "p-2", payload: { provider: { value: "Adobe", status: "proposed" } } }),
      ],
    });

    expect(entries.filter((entry) => entry.kind === "draft")).toHaveLength(2);
  });

  it("attaches a holding's question, reminder and work reasons to it", () => {
    const q = question({ id: "q-1", subscriptionId: "sub-spotify", provider: "Spotify" });
    const r = reminder(SPOTIFY, "2026-02-01");
    const [, spotify] = build({
      sections: sections({ overdue: [SPOTIFY], unfinished: [SPOTIFY], questions: [q], reminders: [r] }),
    });

    expect(spotify.questions).toEqual([q]);
    expect(spotify.reminders).toEqual([r]);
    expect(spotify.reasons).toEqual(["overdue", "unfinished"]);
  });

  it("hides a field question while a pending card on the holding carries that field", () => {
    const renewal = question({
      id: "q-renewal",
      reason: "renewal",
      subscriptionId: "sub-netflix",
      provider: "Netflix",
      scopeKey: "holding:sub-netflix",
    });
    const amount = question({
      id: "q-amount",
      reason: "amount",
      subscriptionId: "sub-netflix",
      provider: "Netflix",
      scopeKey: "holding:sub-netflix",
    });
    const update = proposal({
      id: "p-update",
      kind: "update",
      subscriptionId: "sub-netflix",
      subscriptionProvider: "Netflix",
      payload: { nextRenewal: { value: "2026-03-01", status: "inferred" } },
    });

    const [withCard] = build({
      proposals: [update],
      sections: sections({ questions: [renewal, amount] }),
    });
    expect(withCard.questions).toEqual([amount]);

    const [afterReject] = build({
      proposals: [{ ...update, state: "rejected" }],
      sections: sections({ questions: [renewal, amount] }),
    });
    expect(afterReject.questions).toEqual([renewal, amount]);
  });

  it("hides a draft's field question while its own card carries that field", () => {
    const draft = proposal({
      id: "p-readwise",
      draftScope: "draft:readwise|",
      payload: {
        provider: { value: "Readwise", status: "proposed" },
        amountMinor: { value: 999, status: "proposed" },
      },
    });
    const amount = question({ id: "q-amount", reason: "amount" });
    const cadence = question({ id: "q-cadence", reason: "cadence" });
    const entries = build({
      proposals: [draft],
      sections: sections({ questions: [amount, cadence] }),
    });
    const readwise = entries.find((entry) => entry.kind === "draft");

    expect(entries).toHaveLength(3);
    expect(readwise?.questions).toEqual([cadence]);
  });

  it("keeps a holding the inventory page did not include, from what named it", () => {
    const entries = build({
      items: [NETFLIX],
      sections: sections({ reminders: [reminder(ICLOUD, "2026-03-01")] }),
    });
    const icloud = entries.find((entry) => entry.key === "sub-icloud");

    expect(icloud).toMatchObject({ kind: "saved", provider: "iCloud", item: ICLOUD });
  });

  it("puts a question asked of a draft with that draft", () => {
    const entries = build({
      proposals: [proposal({ id: "p-readwise" })],
      sections: sections({ questions: [question({ id: "q-1" })] }),
    });
    const readwise = entries.find((entry) => entry.key === "draft:p-readwise");

    expect(readwise?.questions.map((q) => q.id)).toEqual(["q-1"]);
    expect(entries).toHaveLength(3);
  });

  it("puts each account's question with its own draft of one provider", () => {
    const personal = proposal({
      id: "p-personal",
      payload: { provider: { value: "ChatPRD", status: "proposed" }, accountHint: "personal@example.com" },
      draftScope: "draft:chatprd|personal@example.com",
    });
    const family = proposal({
      id: "p-family",
      payload: { provider: { value: "ChatPRD", status: "proposed" }, accountHint: "family@example.com" },
      draftScope: "draft:chatprd|family@example.com",
    });
    const entries = build({
      proposals: [personal, family],
      sections: sections({
        questions: [
          question({ id: "q-family", provider: "ChatPRD", reason: "amount", scopeKey: "draft:chatprd|family@example.com" }),
          question({ id: "q-personal", provider: "ChatPRD", reason: "amount", scopeKey: "draft:chatprd|personal@example.com" }),
        ],
      }),
    });

    expect(entries.find((entry) => entry.key === "draft:p-personal")?.questions.map((q) => q.id)).toEqual(["q-personal"]);
    expect(entries.find((entry) => entry.key === "draft:p-family")?.questions.map((q) => q.id)).toEqual(["q-family"]);
    expect(entries.filter((entry) => entry.draft === null && entry.kind === "draft")).toHaveLength(0);
  });

  it("does not choose between drafts for a question that names no holding", () => {
    const entries = build({
      proposals: [
        proposal({ id: "p-1", payload: { provider: { value: "Readwise", status: "proposed" } } }),
        proposal({ id: "p-2", payload: { provider: { value: "readwise", status: "proposed" } } }),
      ],
      sections: sections({ questions: [question({ id: "q-1" })] }),
    });
    const loose = entries.find((entry) => entry.key === "question:q-1");

    expect(loose).toMatchObject({ kind: "draft", draft: null, provider: "Readwise" });
    expect(entries.filter((entry) => entry.questions.length > 0)).toHaveLength(1);
  });

  it("keeps a question with no draft at all reachable on its own", () => {
    const entries = build({ sections: sections({ questions: [question({ id: "q-1" })] }) });

    expect(entries.map((entry) => entry.key)).toEqual([
      "sub-netflix",
      "sub-spotify",
      "question:q-1",
    ]);
  });
});

describe("filters", () => {
  const draft = proposal({ id: "p-readwise" });
  const update = proposal({
    id: "p-update",
    kind: "update",
    subscriptionId: "sub-netflix",
    subscriptionProvider: "Netflix",
  });
  const entries = build({
    proposals: [draft, update],
    sections: sections({
      unfinished: [SPOTIFY],
      questions: [
        question({ id: "q-1" }),
        question({ id: "q-2", subscriptionId: "sub-netflix", provider: "Netflix", state: "deferred" }),
      ],
      reminders: [reminder(NETFLIX, "2026-02-01")],
    }),
  });

  it("counts subscriptions and drafts, not cards or questions", () => {
    expect(filterCounts(entries)).toEqual({ all: 2, reviews: 3, questions: 2, reminders: 1 });
  });

  it("leaves drafts out of All and puts them under Pending reviews", () => {
    const readwise = entries.find((entry) => entry.key === "draft:p-readwise")!;

    expect(matchesFilter(readwise, "all")).toBe(false);
    expect(matchesFilter(readwise, "reviews")).toBe(true);
  });

  it("treats a holding that needs reconciling or finishing as a pending review", () => {
    const spotify = entries.find((entry) => entry.key === "sub-spotify")!;

    expect(matchesFilter(spotify, "reviews")).toBe(true);
  });

  it("counts a deferred question as still open", () => {
    const netflix = entries.find((entry) => entry.key === "sub-netflix")!;

    expect(matchesFilter(netflix, "questions")).toBe(true);
  });

  it("keeps the open row visible after it leaves the filter", () => {
    const visible = visibleEntries(entries, "reminders", "sub-spotify");

    expect(visible.map((entry) => entry.key)).toEqual(["sub-netflix", "sub-spotify"]);
    expect(visibleEntries(entries, "reminders", null).map((entry) => entry.key)).toEqual([
      "sub-netflix",
    ]);
  });

  it("orders Reminders by what is due first", () => {
    const list = build({
      sections: sections({
        reminders: [reminder(SPOTIFY, "2026-03-01"), reminder(NETFLIX, "2026-02-01")],
      }),
    });

    expect(visibleEntries(list, "reminders", null).map((entry) => entry.key)).toEqual([
      "sub-netflix",
      "sub-spotify",
    ]);
  });
});

describe("open entry", () => {
  it("names a holding by its id and a draft by its card", () => {
    const entries = build({ proposals: [proposal({ id: "p-readwise" })] });

    expect(openEntry(entries[0])).toEqual({ recordId: "sub-netflix", draftId: null });
    expect(openEntry(entries[2])).toEqual({ recordId: null, draftId: "p-readwise" });
    expect(findEntry(entries, { recordId: null, draftId: "p-readwise" })).toBe(entries[2]);
    expect(findEntry(entries, { recordId: "sub-spotify", draftId: null })).toBe(entries[1]);
  });

  it("names a question asked of no card by the question", () => {
    const entries = build({ sections: sections({ questions: [question({ id: "q-1" })] }) });
    const loose = entries[2];

    expect(openEntry(loose)).toEqual({ recordId: null, draftId: "q-1" });
    expect(findEntry(entries, openEntry(loose))).toBe(loose);
    expect(findEntry(entries, { recordId: null, draftId: null })).toBeNull();
  });
});
