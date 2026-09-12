import { describe, expect, it } from "vitest";

import { isGenericProviderName, providerNameMatches, splitPlanFromProvider } from "./provider-name";

/**
 * SUB-66: a billing excerpt hangs its facts on "your plan" or "next billing
 * date" rather than on the service name. Those phrases name nothing, so they
 * neither compete with the selected subscription nor count as naming one.
 */
describe("generic billing names", () => {
  it("treats billing filler as no name at all", () => {
    for (const name of [
      "",
      "Your plan",
      "Your",
      "Your subscription",
      "Annual plan",
      "Annual plan next",
      "next billing date",
      "This membership",
      "Free trial",
    ]) {
      expect(isGenericProviderName(name), name).toBe(true);
    }
  });

  it("keeps a real service name, even one wrapped in billing words", () => {
    for (const name of ["ChatGPT", "Warp", "ChatGPT Your plan", "Warp Annual plan", "Spotify"]) {
      expect(isGenericProviderName(name), name).toBe(false);
    }
  });
});

describe("matching a heard name to the selection", () => {
  it("matches the same name and the same name with filler around it", () => {
    expect(providerNameMatches("ChatGPT", "chatgpt")).toBe(true);
    expect(providerNameMatches("ChatGPT Your plan", "chatgpt")).toBe(true);
    expect(providerNameMatches("Warp Annual plan", "warp")).toBe(true);
    expect(providerNameMatches("Athletic", "the-athletic")).toBe(true);
  });

  it("does not match a different service or a filler-only name", () => {
    expect(providerNameMatches("Spotify", "netflix")).toBe(false);
    expect(providerNameMatches("Spotify your plan", "netflix")).toBe(false);
    expect(providerNameMatches("Your plan", "chatgpt")).toBe(false);
    expect(providerNameMatches("", "chatgpt")).toBe(false);
  });
});

/**
 * SUB-67: a named service with its plan in one breath ("Claude Pro") is the
 * selected service with a plan, not a competing service. The split reads the
 * selection's name off the front and leaves the rest as the plan; a plan word
 * is never made generic filler for this.
 */
describe("splitting a plan off a heard name", () => {
  it("reads the trailing words as the plan of the selected service", () => {
    expect(splitPlanFromProvider("Claude Pro", "claude")).toEqual({ plan: "Pro" });
    expect(splitPlanFromProvider("Netflix Standard with ads", "netflix")).toEqual({
      plan: "Standard ads",
    });
    expect(splitPlanFromProvider("The Athletic Annual Plus", "the-athletic")).toEqual({
      plan: "Plus",
    });
    expect(splitPlanFromProvider("YouTube Premium Family", "youtube-premium")).toEqual({
      plan: "Family",
    });
  });

  it("does not read a different service, the bare name, or the shorter name as a plan", () => {
    expect(splitPlanFromProvider("Spotify Premium", "netflix")).toBeNull();
    expect(splitPlanFromProvider("Claude", "claude")).toBeNull();
    expect(splitPlanFromProvider("Claude Your plan", "claude")).toBeNull();
    expect(splitPlanFromProvider("Claude", "claude-pro")).toBeNull();
    expect(splitPlanFromProvider("Pro Claude", "claude")).toBeNull();
    expect(splitPlanFromProvider("Your plan", "claude")).toBeNull();
  });
});
