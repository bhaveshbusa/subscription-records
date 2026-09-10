import { describe, expect, it } from "vitest";

import {
  clearDraft,
  draftKey,
  parseTargetDescriptor,
  readDraft,
  readSelectedTarget,
  targetFromSearch,
  targetToSearch,
  writeDraft,
  writeSelectedTarget,
  type DraftStorage,
} from "./draft-store";
import type { TargetDescriptor } from "./target-fields";

const ID = "6f1a5b1e-3c2d-4e5f-8a9b-0c1d2e3f4a5b";
const OTHER_ID = "0f1a5b1e-3c2d-4e5f-8a9b-0c1d2e3f4a5b";

const NETFLIX: TargetDescriptor = { kind: "subscription", id: ID, provider: "Netflix" };
const QUESTION: TargetDescriptor = {
  kind: "question",
  id: OTHER_ID,
  provider: "Figma",
  question: "How much is Figma?",
  subscriptionId: null,
};

function memory(): DraftStorage & { size: () => number } {
  const map = new Map<string, string>();

  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    size: () => map.size,
  };
}

describe("draft store", () => {
  it("keeps one draft per target, so switching targets does not lose what was typed", () => {
    const storage = memory();

    writeDraft(storage, NETFLIX, { text: "£12 monthly", clientTurnId: null });
    writeDraft(storage, QUESTION, { text: "£8 yearly", clientTurnId: null });
    writeDraft(storage, { kind: "all" }, { text: "Spotify", clientTurnId: null });

    expect(readDraft(storage, NETFLIX)).toEqual({ text: "£12 monthly", clientTurnId: null });
    expect(readDraft(storage, QUESTION)).toEqual({ text: "£8 yearly", clientTurnId: null });
    expect(readDraft(storage, { kind: "all" })).toEqual({ text: "Spotify", clientTurnId: null });
    expect(draftKey(NETFLIX)).not.toBe(draftKey({ kind: "proposal", id: ID, provider: "Netflix", subscriptionId: null }));
  });

  it("drops an empty draft, but keeps one that still carries a retry id", () => {
    const storage = memory();

    writeDraft(storage, NETFLIX, { text: "£12 monthly", clientTurnId: null });
    writeDraft(storage, NETFLIX, { text: "", clientTurnId: null });

    expect(readDraft(storage, NETFLIX)).toBeNull();
    expect(storage.size()).toBe(0);

    writeDraft(storage, NETFLIX, { text: "£12 monthly", clientTurnId: ID });
    expect(readDraft(storage, NETFLIX)?.clientTurnId).toBe(ID);

    clearDraft(storage, NETFLIX);
    expect(readDraft(storage, NETFLIX)).toBeNull();
  });

  it("ignores a draft it cannot read rather than throwing", () => {
    const storage = memory();

    storage.setItem(draftKey(NETFLIX), "{not json");
    expect(readDraft(storage, NETFLIX)).toBeNull();

    storage.setItem(draftKey(NETFLIX), JSON.stringify({ text: 12 }));
    expect(readDraft(storage, NETFLIX)).toBeNull();
  });

  it("round-trips the selected target through the URL, and clears it for all subscriptions", () => {
    const search = targetToSearch(NETFLIX);

    expect(search).toBe(`subscription:${ID}`);
    expect(targetFromSearch(new URLSearchParams({ about: search ?? "" }))).toEqual({
      kind: "subscription",
      id: ID,
      provider: "",
    });
    expect(targetToSearch({ kind: "all" })).toBeNull();
    expect(targetFromSearch(new URLSearchParams())).toBeNull();
    expect(targetFromSearch(new URLSearchParams({ about: "subscription:not-a-uuid" }))).toBeNull();
    expect(targetFromSearch(new URLSearchParams({ about: `ledger:${ID}` }))).toBeNull();
  });

  it("remembers the last target for a bare return, and forgets it for all subscriptions", () => {
    const storage = memory();

    writeSelectedTarget(storage, QUESTION);
    expect(readSelectedTarget(storage)).toEqual(QUESTION);

    writeSelectedTarget(storage, { kind: "all" });
    expect(readSelectedTarget(storage)).toBeNull();
  });

  it("accepts only a well-formed descriptor from storage; authority stays with the server", () => {
    expect(parseTargetDescriptor({ kind: "all" })).toEqual({ kind: "all" });
    expect(parseTargetDescriptor({ kind: "subscription", id: "1", provider: "x" })).toBeNull();
    expect(parseTargetDescriptor({ kind: "ledger", id: ID })).toBeNull();
    expect(parseTargetDescriptor(null)).toBeNull();
    expect(parseTargetDescriptor(NETFLIX)).toEqual(NETFLIX);
  });
});
