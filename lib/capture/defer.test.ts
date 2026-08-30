import { describe, expect, it } from "vitest";

import { isDeferral } from "./defer";

describe("isDeferral", () => {
  it.each([
    "later",
    "I'll tell you the price later",
    "not sure yet",
    "no idea",
    "I'll check and let you know",
    "skip",
  ])("reads %j as putting the question off", (text) => {
    expect(isDeferral(text)).toBe(true);
  });

  it.each(["£9.99 a month", "Netflix", "renews later this month on 2026-09-30", ""])(
    "reads %j as something to extract",
    (text) => {
      expect(isDeferral(text)).toBe(false);
    },
  );
});
