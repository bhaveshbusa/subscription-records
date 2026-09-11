import { describe, expect, it } from "vitest";

import type { SubscriptionListItem } from "@/lib/subscriptions/projection";

import type { InboxQuestion, InboxSections } from "./query";
import { nextQuestionId, workQueue } from "./work-queue";

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

function question(overrides: Partial<InboxQuestion> = {}): InboxQuestion {
  return {
    id: "question-1",
    provider: "Netflix",
    reason: "duplicate",
    state: "asked",
    question: "Is this the same Netflix you already hold?",
    subscriptionId: null,
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function sections(overrides: Partial<InboxSections> = {}): InboxSections {
  return { overdue: [], unfinished: [], reminders: [], questions: [], ...overrides };
}

const NETFLIX = item("sub-netflix", "Netflix");
const SPOTIFY = item("sub-spotify", "Spotify");

describe("workQueue", () => {
  it("gives a holding in two sections one card carrying both reasons", () => {
    const queue = workQueue(sections({ overdue: [NETFLIX], unfinished: [NETFLIX] }));

    expect(queue.groups).toHaveLength(1);
    expect(queue.groups[0].subscriptionId).toBe("sub-netflix");
    expect(queue.groups[0].reasons).toEqual(["overdue", "unfinished"]);
    expect(queue.count).toBe(1);
  });

  it("keeps distinct holdings apart", () => {
    const queue = workQueue(sections({ overdue: [NETFLIX], unfinished: [SPOTIFY] }));

    expect(queue.groups.map((group) => group.subscriptionId)).toEqual([
      "sub-netflix",
      "sub-spotify",
    ]);
    expect(queue.count).toBe(2);
  });

  it("folds a question onto the holding it is about", () => {
    const about = question({ id: "q-netflix", subscriptionId: "sub-netflix" });
    const queue = workQueue(sections({ overdue: [NETFLIX], questions: [about] }));

    expect(queue.groups[0].questions).toEqual([about]);
    expect(queue.questions).toEqual([]);
    expect(queue.count).toBe(1);
  });

  it("keeps a question about no card of its own, including a deferred one", () => {
    const loose = question({ id: "q-loose" });
    const deferred = question({
      id: "q-deferred",
      state: "deferred",
      subscriptionId: "sub-unlisted",
    });
    const queue = workQueue(sections({ questions: [loose, deferred] }));

    expect(queue.questions).toEqual([loose, deferred]);
    expect(queue.count).toBe(2);
  });

  it("passes reminders through untouched", () => {
    const reminders = sections().reminders;

    expect(workQueue(sections({ reminders })).reminders).toBe(reminders);
  });
});

describe("nextQuestionId", () => {
  it("takes the oldest question still asked, wherever it sits", () => {
    const queue = workQueue(
      sections({
        overdue: [NETFLIX],
        questions: [
          question({ id: "q-new", updatedAt: "2026-02-01T00:00:00.000Z" }),
          question({
            id: "q-old",
            subscriptionId: "sub-netflix",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
        ],
      }),
    );

    expect(nextQuestionId(queue)).toBe("q-old");
  });

  it("does not put a deferred question in the prominent slot", () => {
    const queue = workQueue(
      sections({ questions: [question({ id: "q-deferred", state: "deferred" })] }),
    );

    expect(nextQuestionId(queue)).toBeNull();
  });
});
