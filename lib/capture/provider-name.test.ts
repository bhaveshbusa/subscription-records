import { describe, expect, it } from "vitest";

import { isGenericProviderName, providerNameMatches } from "./provider-name";

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
