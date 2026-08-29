import { describe, expect, it } from "vitest";

import {
  DEFAULT_LEDGER_VIEW,
  ledgerApiSearch,
  ledgerViewToSearch,
  parseLedgerView,
} from "./ledger-view";

function parse(search: string) {
  return parseLedgerView(new URLSearchParams(search));
}

describe("parseLedgerView", () => {
  it("defaults to an unfiltered ledger sorted by next renewal", () => {
    expect(parse("")).toEqual(DEFAULT_LEDGER_VIEW);
  });

  it("reads the filters, sort and page size from the URL", () => {
    expect(parse("q=net&status=cancelled&sort=provider&order=desc&limit=5")).toEqual({
      q: "net",
      filter: "cancelled",
      sort: "provider",
      order: "desc",
      limit: 5,
    });
  });

  it("treats needsAttention as its own chip, ahead of status", () => {
    expect(parse("needsAttention=true&status=active").filter).toBe("needsAttention");
    expect(parse("needsAttention=false&status=active").filter).toBe("active");
  });

  it("ignores values it cannot use", () => {
    expect(parse("status=retired&sort=price&order=sideways&limit=999")).toEqual(
      DEFAULT_LEDGER_VIEW,
    );
  });
});

describe("ledgerViewToSearch", () => {
  it("keeps a shareable query string without the defaults", () => {
    expect(ledgerViewToSearch(parse("q=net&status=active"))).toBe("q=net&status=active");
    expect(ledgerViewToSearch(DEFAULT_LEDGER_VIEW)).toBe("");
  });

  it("round trips through the URL", () => {
    const view = parse("q=claude&needsAttention=true&sort=updatedAt&order=desc&limit=5");

    expect(parse(ledgerViewToSearch(view))).toEqual(view);
  });
});

describe("ledgerApiSearch", () => {
  it("always states the sort so the API and UI agree", () => {
    expect(ledgerApiSearch(DEFAULT_LEDGER_VIEW)).toBe("sort=nextRenewal&order=asc");
  });

  it("maps the needs-attention chip onto the API filter", () => {
    expect(ledgerApiSearch(parse("needsAttention=true"))).toBe(
      "needsAttention=true&sort=nextRenewal&order=asc",
    );
  });

  it("appends the cursor for later pages", () => {
    expect(ledgerApiSearch(parse("limit=5"), "cursor-token")).toBe(
      "sort=nextRenewal&order=asc&limit=5&cursor=cursor-token",
    );
  });
});
