import { describe, expect, it } from "vitest";

import { createSeedData, SEED_SUBSCRIPTION_IDS } from "@/lib/db/seed-data";

import { monthlyEquivalentMinor, toListItem, type SubscriptionRow } from "./projection";

describe("monthlyEquivalentMinor", () => {
  it("passes monthly amounts through", () => {
    expect(monthlyEquivalentMinor(1599, "monthly")).toBe(1599);
  });

  it("divides yearly amounts by twelve and rounds to minor units", () => {
    expect(monthlyEquivalentMinor(9600, "yearly")).toBe(800);
    expect(monthlyEquivalentMinor(3599, "yearly")).toBe(300);
  });

  it("spreads weekly amounts over 52 weeks a year", () => {
    expect(monthlyEquivalentMinor(300, "weekly")).toBe(1300);
    expect(monthlyEquivalentMinor(299, "weekly")).toBe(1296);
  });

  it("is null when the amount or cadence is unknown", () => {
    expect(monthlyEquivalentMinor(null, "monthly")).toBeNull();
    expect(monthlyEquivalentMinor(1599, null)).toBeNull();
  });
});

describe("toListItem", () => {
  const seed = createSeedData(new Date("2026-06-15T12:00:00.000Z"));

  function rowFor(id: string): SubscriptionRow {
    const row = seed.subscriptions.find((entry) => entry.id === id);

    if (!row) {
      throw new Error(`seed row ${id} is missing`);
    }

    return {
      ...row,
      created_at: new Date("2026-06-15T12:00:00.000Z"),
      updated_at: new Date("2026-06-15T12:00:00.000Z"),
    } as SubscriptionRow;
  }

  it("carries value, field status and confidence for each field", () => {
    const item = toListItem(rowFor(SEED_SUBSCRIPTION_IDS.netflix));

    expect(item.provider).toEqual({ value: "Netflix", status: "confirmed", confidence: "high" });
    expect(item.amount).toEqual({
      value: { minor: 1599, currency: "GBP" },
      status: "confirmed",
      confidence: "high",
    });
    expect(item.monthlyEquivalentMinor).toBe(1599);
    expect(item.updatedAt).toBe("2026-06-15T12:00:00.000Z");
  });

  it("keeps inferred amounts marked as inferred", () => {
    expect(toListItem(rowFor(SEED_SUBSCRIPTION_IDS.adobe)).amount.status).toBe("inferred");
  });

  it("renders an incomplete stub without inventing values", () => {
    const item = toListItem(rowFor(SEED_SUBSCRIPTION_IDS.disneyPlus));

    expect(item.amount.value).toBeNull();
    expect(item.cadence.value).toBeNull();
    expect(item.nextRenewal.value).toBeNull();
    expect(item.monthlyEquivalentMinor).toBeNull();
  });
});
