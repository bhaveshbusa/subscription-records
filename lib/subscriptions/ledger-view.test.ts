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
  it("defaults to holding rows sorted by next renewal", () => {
    expect(parse("")).toEqual(DEFAULT_LEDGER_VIEW);
    expect(DEFAULT_LEDGER_VIEW.filter).toBe("holding");
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
    expect(parse("all=true").filter).toBe("all");
  });

  it("treats the old active chip as holding", () => {
    expect(parse("status=active").filter).toBe("holding");
  });

  it("ignores values it cannot use", () => {
    expect(parse("status=retired&sort=price&order=sideways&limit=999")).toEqual(
      DEFAULT_LEDGER_VIEW,
    );
  });
});

describe("ledgerViewToSearch", () => {
  it("keeps a shareable query string without the defaults", () => {
    expect(ledgerViewToSearch(parse("q=net&status=cancelled"))).toBe("q=net&status=cancelled");
    expect(ledgerViewToSearch(DEFAULT_LEDGER_VIEW)).toBe("");
    expect(ledgerViewToSearch(parse("all=true"))).toBe("all=true");
  });

  it("round trips through the URL", () => {
    const view = parse("q=claude&needsAttention=true&sort=updatedAt&order=desc&limit=5");

    expect(parse(ledgerViewToSearch(view))).toEqual(view);
  });
});

describe("ledgerApiSearch", () => {
  it("filters the default view to holding statuses", () => {
    expect(ledgerApiSearch(DEFAULT_LEDGER_VIEW)).toBe(
      "status=active%2Ctrial%2Cpaused%2Ccancel_scheduled&sort=nextRenewal&order=asc",
    );
  });

  it("maps the needs-attention chip onto the API filter", () => {
    expect(ledgerApiSearch(parse("needsAttention=true"))).toBe(
      "needsAttention=true&sort=nextRenewal&order=asc",
    );
  });

  it("leaves All unfiltered at the API", () => {
    expect(ledgerApiSearch(parse("all=true"))).toBe("sort=nextRenewal&order=asc");
  });

  it("appends the cursor for later pages", () => {
    expect(ledgerApiSearch(parse("limit=5"), "cursor-token")).toBe(
      "status=active%2Ctrial%2Cpaused%2Ccancel_scheduled&sort=nextRenewal&order=asc&limit=5&cursor=cursor-token",
    );
  });
});
