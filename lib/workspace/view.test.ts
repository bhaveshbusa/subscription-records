import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORKSPACE_STATE,
  legacyWorkspaceHref,
  parseWorkspaceState,
  recordWorkspaceHref,
  toSearchParams,
  workspaceHref,
} from "./view";

const RECORD = "11111111-2222-4333-8444-555555555555";
const DRAFT = "66666666-7777-4888-8999-aaaaaaaaaaaa";

function parse(search: string) {
  return parseWorkspaceState(new URLSearchParams(search));
}

function href(search: string, patch: Parameters<typeof workspaceHref>[1]) {
  return workspaceHref(new URLSearchParams(search), patch);
}

describe("parseWorkspaceState", () => {
  it("opens on every saved subscription with nothing open", () => {
    expect(parse("")).toEqual(DEFAULT_WORKSPACE_STATE);
  });

  it("reads the filter and the open subscription", () => {
    expect(parse(`show=questions&record=${RECORD}`)).toEqual({
      filter: "questions",
      recordId: RECORD,
      draftId: null,
    });
  });

  it("opens a draft that is not a holding yet", () => {
    expect(parse(`show=reviews&draft=${DRAFT}`)).toEqual({
      filter: "reviews",
      recordId: null,
      draftId: DRAFT,
    });
  });

  it("opens one subscription at a time, the saved one first", () => {
    expect(parse(`record=${RECORD}&draft=${DRAFT}`)).toEqual({
      filter: "all",
      recordId: RECORD,
      draftId: null,
    });
  });

  it("lands an old Work link on Pending reviews", () => {
    expect(parse("view=work").filter).toBe("reviews");
    expect(parse("view=subscriptions").filter).toBe("all");
    expect(parse("view=work&show=reminders").filter).toBe("reminders");
  });

  it("ignores an id it cannot use and an unknown filter", () => {
    expect(parse("record=not-an-id&draft=nope&show=sideways")).toEqual(
      DEFAULT_WORKSPACE_STATE,
    );
  });
});

describe("workspaceHref", () => {
  it("keeps the composer target and the inventory filters", () => {
    expect(href("about=subscription:abc&status=cancelled&q=net", { filter: "reviews" })).toBe(
      "/workspace?about=subscription%3Aabc&status=cancelled&q=net&show=reviews",
    );
  });

  it("writes nothing for the default state", () => {
    expect(href("", {})).toBe("/workspace");
    expect(href(`show=all&record=${RECORD}`, { recordId: null })).toBe("/workspace");
  });

  it("changes the filter without closing the open subscription", () => {
    expect(href(`record=${RECORD}`, { filter: "reminders" })).toBe(
      `/workspace?record=${RECORD}&show=reminders`,
    );
  });

  it("closes a draft when a saved subscription opens, and the reverse", () => {
    expect(href(`draft=${DRAFT}`, { recordId: RECORD })).toBe(`/workspace?record=${RECORD}`);
    expect(href(`record=${RECORD}`, { recordId: null, draftId: DRAFT })).toBe(
      `/workspace?draft=${DRAFT}`,
    );
  });

  it("drops the params the old two-view shell used", () => {
    expect(href(`view=work&pane=record&record=${RECORD}`, {})).toBe(
      `/workspace?record=${RECORD}&show=reviews`,
    );
  });

  it("opens one record from its id alone", () => {
    expect(recordWorkspaceHref(RECORD)).toBe(`/workspace?record=${RECORD}`);
  });
});

describe("legacyWorkspaceHref", () => {
  it("sends an /inbox link to Pending reviews with its target intact", () => {
    expect(
      legacyWorkspaceHref(toSearchParams({ about: "question:q1" }), { filter: "reviews" }),
    ).toBe("/workspace?about=question%3Aq1&show=reviews");
  });

  it("sends a filtered /ledger link to the list with its filters", () => {
    expect(
      legacyWorkspaceHref(toSearchParams({ status: "cancelled", sort: "provider" }), {}),
    ).toBe("/workspace?status=cancelled&sort=provider");
  });

  it("sends a /ledger/<id> link to that record", () => {
    expect(legacyWorkspaceHref(toSearchParams({}), { recordId: RECORD })).toBe(
      `/workspace?record=${RECORD}`,
    );
  });

  /** A stale link cannot smuggle in workspace state of its own. */
  it("ignores workspace params already on the old link", () => {
    expect(
      legacyWorkspaceHref(
        toSearchParams({ view: "work", pane: "record", show: "questions", draft: DRAFT }),
        {},
      ),
    ).toBe("/workspace");
  });
});

describe("toSearchParams", () => {
  it("keeps every value of a repeated param and drops the absent ones", () => {
    expect(toSearchParams({ q: ["net", "flix"], missing: undefined }).toString()).toBe(
      "q=net&q=flix",
    );
  });
});
