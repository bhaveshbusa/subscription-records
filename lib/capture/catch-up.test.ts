import { describe, expect, it } from "vitest";

import {
  joinProviderNames,
  readStillHoldingReply,
  stillHoldingQuestion,
} from "./catch-up";

describe("joinProviderNames", () => {
  it("reads one, two, and many names in a sentence", () => {
    expect(joinProviderNames(["Headspace"])).toBe("Headspace");
    expect(joinProviderNames(["Headspace", "GitHub"])).toBe("Headspace and GitHub");
    expect(joinProviderNames(["Headspace", "GitHub", "Notion"])).toBe(
      "Headspace, GitHub, and Notion",
    );
  });
});

describe("stillHoldingQuestion", () => {
  it("asks one catch-up about the stale providers", () => {
    expect(stillHoldingQuestion(["Headspace"])).toEqual({
      reason: "still_holding",
      provider: "these subscriptions",
      question: "Are you still holding Headspace?",
    });
  });
});

describe("readStillHoldingReply", () => {
  it("reads a bare yes or no", () => {
    expect(readStillHoldingReply("yes")).toBe("yes");
    expect(readStillHoldingReply("Still have them")).toBe("yes");
    expect(readStillHoldingReply("no")).toBe("no");
    expect(readStillHoldingReply("not anymore")).toBe("no");
  });

  it("leaves a capture message to the extractor", () => {
    expect(readStillHoldingReply("I cancelled Headspace three months ago")).toBeNull();
    expect(readStillHoldingReply("I subscribed to Linear")).toBeNull();
    expect(readStillHoldingReply("£9.99 a month")).toBeNull();
  });
});
