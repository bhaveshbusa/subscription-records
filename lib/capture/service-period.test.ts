import { describe, expect, it } from "vitest";

import { readServicePeriod, reviewRationale } from "./service-period";

/** Captured during the billed period: 8 October to 8 November 2026. */
const DURING = new Date("2026-10-20T09:00:00.000Z");

describe("readServicePeriod", () => {
  it("reads one clear calendar month as monthly, ending at the period end", () => {
    expect(readServicePeriod({ from: "2026-10-08", to: "2026-11-08" }, DURING)).toMatchObject({
      cadence: "monthly",
      nextBoundary: "2026-11-08",
    });
  });

  it("says the boundary depends on the service continuing", () => {
    const reading = readServicePeriod({ from: "2026-10-08", to: "2026-11-08" }, DURING);

    expect(reading?.continuation).toMatch(/if the service continues/);
    expect(reading?.continuation).toMatch(/issue or due date is not the renewal/);
    expect(reading?.continuation).toMatch(/nothing here confirms auto-renewal/);
  });

  it("asks about a period that is not one calendar month", () => {
    expect(readServicePeriod({ from: "2026-10-08", to: "2026-11-01" }, DURING)).toBeNull();
    expect(readServicePeriod({ from: "2026-10-08", to: "2026-11-07" }, DURING)).toBeNull();
    expect(readServicePeriod({ from: "2026-10-08", to: "2027-10-08" }, DURING)).toBeNull();
    expect(readServicePeriod({ from: "2026-11-08", to: "2026-10-08" }, DURING)).toBeNull();
  });

  it("asks about a period that has already ended", () => {
    expect(
      readServicePeriod(
        { from: "2026-10-08", to: "2026-11-08" },
        new Date("2026-11-09T09:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("asks about a period that has not started", () => {
    expect(
      readServicePeriod(
        { from: "2026-10-08", to: "2026-11-08" },
        new Date("2026-10-07T09:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("counts the period's own edges as during it", () => {
    for (const day of ["2026-10-08", "2026-11-08"]) {
      expect(
        readServicePeriod({ from: "2026-10-08", to: "2026-11-08" }, new Date(`${day}T23:00:00.000Z`)),
      ).not.toBeNull();
    }
  });

  it("is nothing without a stated period", () => {
    expect(readServicePeriod(null, DURING)).toBeNull();
    expect(readServicePeriod(undefined, DURING)).toBeNull();
  });
});

describe("reviewRationale", () => {
  const candidate = {
    provider: "ExampleService",
    confidence: "high" as const,
    evidence: "Plan: ExampleService Plus; Net £25.00; VAT £5.00",
  };

  it("adds the continuation assumption to a clear period's evidence", () => {
    expect(
      reviewRationale(
        { ...candidate, servicePeriod: { from: "2026-10-08", to: "2026-11-08" } },
        DURING,
      ),
    ).toMatch(/^Plan: ExampleService Plus; Net £25.00; VAT £5.00 Service period 2026-10-08 to 2026-11-08/);
  });

  it("leaves the evidence alone when the period was not read", () => {
    expect(
      reviewRationale(
        { ...candidate, servicePeriod: { from: "2026-08-08", to: "2026-09-08" } },
        DURING,
      ),
    ).toBe(candidate.evidence);
    expect(reviewRationale(candidate, DURING)).toBe(candidate.evidence);
  });
});
