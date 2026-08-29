import { describe, expect, it } from "vitest";

import { parseListQuery } from "./params";

function parse(search: string) {
  return parseListQuery(new URLSearchParams(search));
}

describe("parseListQuery", () => {
  it("applies the documented defaults", () => {
    const result = parse("");

    expect(result).toMatchObject({
      success: true,
      query: { sort: "nextRenewal", order: "asc", limit: 50 },
    });
  });

  it("reads a comma separated status list", () => {
    const result = parse("status=active,cancelled");

    expect(result.success && result.query.status).toEqual(["active", "cancelled"]);
  });

  it("rejects an unknown status", () => {
    expect(parse("status=retired").success).toBe(false);
  });

  it("rejects a limit above the maximum", () => {
    expect(parse("limit=101").success).toBe(false);
    expect(parse("limit=0").success).toBe(false);
    expect(parse("limit=ten").success).toBe(false);
  });

  it("rejects a negative or non-numeric renewal window", () => {
    expect(parse("renewingWithinDays=-1").success).toBe(false);
    expect(parse("renewingWithinDays=soon").success).toBe(false);
    expect(parse("renewingWithinDays=30").success).toBe(true);
  });

  it("reads the needs-attention filter", () => {
    const enabled = parse("needsAttention=true");
    const disabled = parse("needsAttention=0");

    expect(enabled.success && enabled.query.needsAttention).toBe(true);
    expect(disabled.success && disabled.query.needsAttention).toBe(false);
    expect(parse("needsAttention=maybe").success).toBe(false);
  });

  it("rejects an unknown sort key", () => {
    expect(parse("sort=price").success).toBe(false);
  });

  it("treats empty values as absent", () => {
    const result = parse("q=&status=");

    expect(result.success && result.query.q).toBeUndefined();
    expect(result.success && result.query.status).toBeUndefined();
  });
});
