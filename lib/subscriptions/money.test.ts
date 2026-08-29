import { describe, expect, it } from "vitest";

import { parseAmountInput, toAmountInput } from "./money";

describe("parseAmountInput", () => {
  it("treats a blank amount as unknown rather than zero", () => {
    expect(parseAmountInput("")).toEqual({ ok: true, minor: null });
    expect(parseAmountInput("   ")).toEqual({ ok: true, minor: null });
  });

  it("reads pounds and pence exactly", () => {
    expect(parseAmountInput("9.99")).toEqual({ ok: true, minor: 999 });
    expect(parseAmountInput("4")).toEqual({ ok: true, minor: 400 });
    expect(parseAmountInput("4.0")).toEqual({ ok: true, minor: 400 });
    expect(parseAmountInput("0.07")).toEqual({ ok: true, minor: 7 });
    expect(parseAmountInput("119.70")).toEqual({ ok: true, minor: 11970 });
  });

  it("accepts a currency symbol, spaces and a decimal comma", () => {
    expect(parseAmountInput("£ 9.99")).toEqual({ ok: true, minor: 999 });
    expect(parseAmountInput("9,99")).toEqual({ ok: true, minor: 999 });
  });

  it("rejects text that is not an amount", () => {
    expect(parseAmountInput("nine").ok).toBe(false);
    expect(parseAmountInput("9.999").ok).toBe(false);
    expect(parseAmountInput("-9.99").ok).toBe(false);
    expect(parseAmountInput("1e3").ok).toBe(false);
  });
});

describe("toAmountInput", () => {
  it("round-trips minor units through the form text", () => {
    expect(toAmountInput(null)).toBe("");
    expect(toAmountInput(999)).toBe("9.99");
    expect(toAmountInput(400)).toBe("4.00");
    expect(toAmountInput(7)).toBe("0.07");

    for (const minor of [0, 5, 99, 100, 1234, 999999]) {
      expect(parseAmountInput(toAmountInput(minor))).toEqual({ ok: true, minor });
    }
  });
});
