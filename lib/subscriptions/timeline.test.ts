import { describe, expect, it } from "vitest";

import { timelineEntries } from "./timeline";

describe("timelineEntries", () => {
  it("returns an empty list when there are no events", () => {
    expect(timelineEntries({ events: [] })).toEqual([]);
  });

  it("lists lifecycle events in reverse chronological order, without charges", () => {
    const entries = timelineEntries({
      events: [
        {
          id: "e1",
          type: "started",
          at: "2025-08-29T00:00:00.000Z",
          confirmed: true,
          rationale: "Seeded development subscription.",
        },
        {
          id: "e2",
          type: "cancelled",
          at: "2026-07-30T00:00:00.000Z",
          confirmed: false,
          rationale: null,
        },
        {
          id: "e3",
          type: "charged",
          at: "2026-08-17T00:00:00.000Z",
          confirmed: true,
          rationale: "paid",
        },
      ],
    });

    expect(entries.map((entry) => entry.key)).toEqual(["event-e2", "event-e1"]);
    expect(entries[0]).toMatchObject({ title: "Cancelled", unconfirmed: true, detail: null });
    expect(entries[1]).toMatchObject({
      title: "Started",
      on: "2025-08-29",
      unconfirmed: false,
    });
  });
});
