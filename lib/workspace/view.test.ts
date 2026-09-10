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

function parse(search: string) {
  return parseWorkspaceState(new URLSearchParams(search));
}

function href(search: string, patch: Parameters<typeof workspaceHref>[1]) {
  return workspaceHref(new URLSearchParams(search), patch);
}

describe("parseWorkspaceState", () => {
  it("opens on Work with no record", () => {
    expect(parse("")).toEqual(DEFAULT_WORKSPACE_STATE);
  });

  it("reads the view, the record and the narrow-screen pane", () => {
    expect(parse(`view=subscriptions&record=${RECORD}&pane=conversation`)).toEqual({
      view: "subscriptions",
      recordId: RECORD,
      pane: "conversation",
    });
  });

  it("shows a selected record on a narrow screen unless asked otherwise", () => {
    expect(parse(`record=${RECORD}`).pane).toBe("record");
    expect(parse("").pane).toBe("conversation");
  });

  it("ignores a record id it cannot use and an unknown view", () => {
    expect(parse("record=not-an-id&view=sideways")).toEqual(DEFAULT_WORKSPACE_STATE);
  });
});

describe("workspaceHref", () => {
  it("keeps the composer target and the inventory filters", () => {
    expect(href("about=subscription:abc&status=cancelled&q=net", { view: "subscriptions" })).toBe(
      "/workspace?about=subscription%3Aabc&status=cancelled&q=net&view=subscriptions",
    );
  });

  it("writes nothing for the default state", () => {
    expect(href("", {})).toBe("/workspace");
    expect(href(`record=${RECORD}`, { recordId: null })).toBe("/workspace");
  });

  it("returns to the conversation without losing the selected record", () => {
    expect(href(`view=subscriptions&record=${RECORD}`, { pane: "conversation" })).toBe(
      `/workspace?view=subscriptions&record=${RECORD}&pane=conversation`,
    );
  });

  it("opens one record from its id alone", () => {
    expect(recordWorkspaceHref(RECORD)).toBe(`/workspace?record=${RECORD}`);
  });
});

describe("legacyWorkspaceHref", () => {
  it("sends an /inbox link to Work with its target intact", () => {
    expect(
      legacyWorkspaceHref(toSearchParams({ about: "question:q1" }), { view: "work" }),
    ).toBe("/workspace?about=question%3Aq1");
  });

  it("sends a filtered /ledger link to Subscriptions with its filters", () => {
    expect(
      legacyWorkspaceHref(toSearchParams({ status: "cancelled", sort: "provider" }), {
        view: "subscriptions",
      }),
    ).toBe("/workspace?status=cancelled&sort=provider&view=subscriptions");
  });

  it("sends a /ledger/<id> link to that record", () => {
    expect(
      legacyWorkspaceHref(toSearchParams({}), {
        view: "subscriptions",
        recordId: RECORD,
        pane: "record",
      }),
    ).toBe(`/workspace?view=subscriptions&record=${RECORD}`);
  });

  /** A stale link cannot smuggle in workspace state of its own. */
  it("ignores workspace params already on the old link", () => {
    expect(
      legacyWorkspaceHref(toSearchParams({ view: "subscriptions", pane: "record" }), {
        view: "work",
      }),
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
