import { describe, expect, it } from "vitest";

import { appendNotes, statusEditNeedsTiming, toStatusEditBody } from "./status-edit";

describe("statusEditNeedsTiming", () => {
  it("requires timing for cancel, schedule, and reactivate only", () => {
    expect(statusEditNeedsTiming("active", "trial")).toBe(false);
    expect(statusEditNeedsTiming("unknown", "active")).toBe(false);
    expect(statusEditNeedsTiming("paused", "active")).toBe(false);
    expect(statusEditNeedsTiming("cancel_scheduled", "active")).toBe(false);
    expect(statusEditNeedsTiming("active", "cancelled")).toBe(true);
    expect(statusEditNeedsTiming("active", "cancel_scheduled")).toBe(true);
    expect(statusEditNeedsTiming("cancelled", "active")).toBe(true);
    expect(statusEditNeedsTiming("cancelled", "trial")).toBe(true);
    expect(statusEditNeedsTiming("active", "active")).toBe(false);
  });
});

describe("toStatusEditBody", () => {
  const base = {
    initialStatus: "active" as const,
    initialNotes: "",
    draft: {
      status: "active" as const,
      endsOn: "",
      resumedOn: "2026-09-15",
      notes: "",
    },
  };

  it("sends status only for ordinary corrections", () => {
    expect(
      toStatusEditBody({
        ...base,
        draft: { ...base.draft, status: "trial" },
      }),
    ).toEqual({
      ok: true,
      kind: "write",
      body: { status: "trial" },
      success: "Status saved.",
    });
  });

  it("requires an end date for cancelled and does not invent one", () => {
    expect(
      toStatusEditBody({
        ...base,
        draft: { ...base.draft, status: "cancelled" },
      }),
    ).toEqual({
      ok: false,
      message: "Say when it ended, or choose I don't know when.",
    });

    expect(
      toStatusEditBody({
        ...base,
        draft: { ...base.draft, status: "cancelled", endsOn: "2026-03-01", notes: "Card failed" },
      }),
    ).toEqual({
      ok: true,
      kind: "write",
      body: { status: "cancelled", endsOn: "2026-03-01", notes: "Card failed" },
      success: "Cancelled, ending 2026-03-01.",
    });
  });

  it("keeps status unchanged when cancel timing is unknown", () => {
    expect(
      toStatusEditBody({
        ...base,
        initialNotes: "Prior note",
        draft: { ...base.draft, status: "cancelled", notes: "Not sure when" },
        unknownTiming: true,
      }),
    ).toEqual({
      ok: true,
      kind: "unresolved",
      body: { notes: "Prior note\n\nNot sure when" },
      success: "Kept open — timing unknown. Notes saved; status is unchanged.",
    });
  });

  it("requires Ends on for cancel_scheduled", () => {
    expect(
      toStatusEditBody({
        ...base,
        draft: { ...base.draft, status: "cancel_scheduled" },
      }),
    ).toEqual({
      ok: false,
      message: "Set Ends on to the last day it still bills.",
    });
  });

  it("reactivates with resumedOn and no money fields", () => {
    expect(
      toStatusEditBody({
        initialStatus: "cancelled",
        initialNotes: "",
        draft: {
          status: "active",
          endsOn: "",
          resumedOn: "2026-09-01",
          notes: "",
        },
      }),
    ).toEqual({
      ok: true,
      kind: "write",
      body: { status: "active", resumedOn: "2026-09-01" },
      success: "Resumed from 2026-09-01.",
    });
  });

  it("treats leaving cancel_scheduled for active as status-only", () => {
    expect(
      toStatusEditBody({
        initialStatus: "cancel_scheduled",
        initialNotes: "",
        draft: {
          status: "active",
          endsOn: "2026-10-01",
          resumedOn: "2026-09-15",
          notes: "",
        },
      }),
    ).toEqual({
      ok: true,
      kind: "write",
      body: { status: "active" },
      success: "Status saved.",
    });
  });

  it("no-ops when status is unchanged", () => {
    expect(toStatusEditBody(base)).toEqual({ ok: true, kind: "noop", body: {} });
  });
});

describe("appendNotes", () => {
  it("appends without duplicating", () => {
    expect(appendNotes("", "Hello")).toBe("Hello");
    expect(appendNotes("Hello", "")).toBe("Hello");
    expect(appendNotes("Hello", "Hello")).toBe("Hello");
    expect(appendNotes("Hello", "More")).toBe("Hello\n\nMore");
  });
});
