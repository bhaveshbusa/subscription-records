import { describe, expect, it } from "vitest";

import { timelineEntries } from "./timeline";

describe("timelineEntries", () => {
  it("returns an empty list when there are no events or charges", () => {
    expect(timelineEntries({ events: [], charges: [] })).toEqual([]);
  });

  it("merges events and charges in reverse chronological order", () => {
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
      ],
      charges: [
        {
          id: "c1",
          paidOn: "2026-08-17",
          amountMinor: 1599,
          currency: "GBP",
          coversFrom: "2026-08-17",
          coversTo: "2026-09-01",
        },
      ],
    });

    expect(entries.map((entry) => entry.key)).toEqual(["charge-c1", "event-e2", "event-e1"]);
    expect(entries[0]).toEqual({
      key: "charge-c1",
      on: "2026-08-17",
      title: "Charged £15.99",
      detail: "Covers 17 Aug 2026 – 1 Sep 2026",
      unconfirmed: false,
    });
    expect(entries[1]).toMatchObject({ title: "Cancelled", unconfirmed: true, detail: null });
    expect(entries[2]).toMatchObject({
      title: "Started",
      on: "2025-08-29",
      unconfirmed: false,
    });
  });

  it("omits the covers detail when a charge has no coverage window", () => {
    const [entry] = timelineEntries({
      events: [],
      charges: [
        {
          id: "c2",
          paidOn: "2026-08-17",
          amountMinor: 299,
          currency: "GBP",
          coversFrom: null,
          coversTo: null,
        },
      ],
    });

    expect(entry.detail).toBeNull();
  });
});
