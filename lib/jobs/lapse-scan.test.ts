import { describe, expect, it } from "vitest";

import { rollNextRenewal } from "@/lib/subscriptions/dates";

describe("stale schedule roll", () => {
  it("does not treat a passed due date as a lapse", () => {
    expect(rollNextRenewal("2026-08-14", "monthly", "2026-09-04")).toBe("2026-09-14");
  });
});
