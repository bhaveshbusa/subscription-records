import { describe, expect, it } from "vitest";

import {
  DEFAULT_LEDGER_VIEW,
  coverageViewSearch,
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
      coverage: null,
      limit: 5,
    });
  });

  it("reads a coverage filter from the URL", () => {
    expect(parse("all=true&coverage=omitted")).toEqual({
      ...DEFAULT_LEDGER_VIEW,
      filter: "all",
      coverage: "omitted",
    });
  });

  /** The chip is gone; a stale link falls back to the ledger's own default. */
  it("falls back to holding for a link that still asks for needs-attention", () => {
    expect(parse("needsAttention=true").filter).toBe("holding");
    expect(parse("needsAttention=true&status=cancelled").filter).toBe("cancelled");
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
    expect(ledgerViewToSearch(parse("all=true&coverage=unconfirmed"))).toBe(
      "all=true&coverage=unconfirmed",
    );
  });

  it("builds a shareable coverage view from the summary", () => {
    expect(coverageViewSearch("omitted")).toBe("all=true&coverage=omitted");
  });
});

describe("ledgerApiSearch", () => {
  it("filters the default view to holding statuses", () => {
    expect(ledgerApiSearch(DEFAULT_LEDGER_VIEW)).toBe(
      "status=active%2Ctrial%2Cpaused%2Ccancel_scheduled&sort=nextRenewal&order=asc",
    );
  });

  it("appends coverage to the API query", () => {
    expect(ledgerApiSearch(parse("all=true&coverage=omitted"))).toBe(
      "sort=nextRenewal&order=asc&coverage=omitted",
    );
  });

  it("appends the cursor for later pages", () => {
    expect(ledgerApiSearch(parse("limit=5"), "cursor-token")).toBe(
      "status=active%2Ctrial%2Cpaused%2Ccancel_scheduled&sort=nextRenewal&order=asc&limit=5&cursor=cursor-token",
    );
  });
});
