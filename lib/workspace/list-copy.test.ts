import { describe, expect, it } from "vitest";

import { emptyListCopy } from "./list-copy";

describe("empty list copy", () => {
  it("keeps filter-empty distinct from a search miss", () => {
    expect(emptyListCopy("questions").title).toBe("No open questions.");
    expect(emptyListCopy("all", "Northstar").title).toBe("No matching subscriptions.");
    expect(emptyListCopy("all", "Northstar").body).not.toContain("Capture one above");
  });

  it("does not treat whitespace as a search", () => {
    expect(emptyListCopy("reminders", "   ").title).toBe("No reminders due.");
  });
});
