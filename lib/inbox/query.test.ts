import { describe, expect, it } from "vitest";

import { RENEWING_SOON_DAYS, renewingSoonDays } from "./query";

describe("renewingSoonDays", () => {
  it("gives a yearly renewal a month of notice", () => {
    expect(renewingSoonDays("yearly")).toBe(30);
  });

  it("gives a monthly renewal a week", () => {
    expect(renewingSoonDays("monthly")).toBe(7);
  });

  /**
   * A weekly bill renews again before anyone could act on the warning, so it
   * would sit in the section forever and teach the reader to skip it.
   */
  it("never counts a weekly renewal as soon", () => {
    expect(renewingSoonDays("weekly")).toBeNull();
  });

  it("has nothing to say about a row with no cadence", () => {
    expect(renewingSoonDays(null)).toBeNull();
  });

  it("exposes only the cadences that have a window", () => {
    expect(Object.keys(RENEWING_SOON_DAYS).sort()).toEqual(["monthly", "yearly"]);
  });
});
