import { describe, expect, it } from "vitest";

import { DEFAULT_REMINDER_LIMIT, MAX_REMINDER_LIMIT, parseReminderQuery } from "./query";

function parse(search: string) {
  return parseReminderQuery(new URLSearchParams(search));
}

describe("parseReminderQuery", () => {
  it("shows the pending reminders by default", () => {
    const parsed = parse("");

    expect(parsed.success && parsed.query).toEqual({
      state: ["pending"],
      limit: DEFAULT_REMINDER_LIMIT,
    });
  });

  it("accepts several states at once", () => {
    const parsed = parse("state=pending,dismissed");

    expect(parsed.success && parsed.query.state).toEqual(["pending", "dismissed"]);
  });

  it("rejects a state it does not know", () => {
    expect(parse("state=snoozed").success).toBe(false);
    expect(parse("state=,").success).toBe(false);
  });

  it("keeps the page a sane size", () => {
    const parsed = parse("limit=10");

    expect(parsed.success && parsed.query.limit).toBe(10);
    expect(parse(`limit=${MAX_REMINDER_LIMIT + 1}`).success).toBe(false);
    expect(parse("limit=0").success).toBe(false);
    expect(parse("limit=many").success).toBe(false);
  });
});
