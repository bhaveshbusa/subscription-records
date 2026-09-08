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
    const item = toListItem(rowFor(SEED_SUBSCRIPTION_IDS.netflix), "2026-06-15");

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
    expect(toListItem(rowFor(SEED_SUBSCRIPTION_IDS.adobe), "2026-06-15").amount.status).toBe("inferred");
  });

  it("exposes trial end and auto-renewal without substituting them for next renewal", () => {
    const notion = toListItem(rowFor(SEED_SUBSCRIPTION_IDS.notion), "2026-06-15");
    const canva = toListItem(rowFor(SEED_SUBSCRIPTION_IDS.canva), "2026-06-15");
    const netflix = toListItem(rowFor(SEED_SUBSCRIPTION_IDS.netflix), "2026-06-15");

    expect(notion).toMatchObject({
      status: { value: "trial" },
      nextRenewal: { value: null, status: "empty" },
      trialEndsOn: { value: "2026-06-21", status: "proposed" },
      autoRenewal: { value: null, status: "empty" },
      amount: { value: null, status: "empty" },
    });
    expect(canva).toMatchObject({
      status: { value: "trial" },
      amount: { value: { minor: 1000, currency: "GBP" }, status: "confirmed" },
      nextRenewal: { value: null, status: "empty" },
      trialEndsOn: { value: "2026-06-29", status: "confirmed" },
      autoRenewal: { value: null, status: "empty" },
    });
    expect(netflix.autoRenewal).toEqual({
      value: "yes",
      status: "confirmed",
      confidence: "high",
    });
  });

  it("shows a passed due date as stored, with the status it really has", () => {
    const item = toListItem(
      {
        ...rowFor(SEED_SUBSCRIPTION_IDS.headspace),
        next_renewal: "2026-05-15",
        cadence: "monthly",
        renewal_field_status: "confirmed",
      },
      "2026-06-15",
    );

    expect(item.nextRenewal).toEqual({
      value: "2026-05-15",
      status: "confirmed",
      confidence: "high",
    });
    expect(item.expectedNextRenewal).toBeUndefined();
  });

  it("adds a labelled expected date beside a confirmed auto-renewing recorded date", () => {
    const item = toListItem(rowFor(SEED_SUBSCRIPTION_IDS.cursor), "2026-06-15");

    expect(item.nextRenewal).toEqual({
      value: "2026-04-06",
      status: "confirmed",
      confidence: "high",
    });
    expect(item.expectedNextRenewal).toEqual({
      value: "2026-07-06",
      status: "inferred",
      basis: "expected",
    });
  });

  it("does not invent an expected date for a trial, even with confirmed auto-renewal", () => {
    const item = toListItem(rowFor(SEED_SUBSCRIPTION_IDS.calm), "2026-06-15");

    expect(item.status.value).toBe("trial");
    expect(item.expectedNextRenewal).toBeUndefined();
    expect(item.trialEndsOn.value).toBe("2026-06-11");
  });

  it("renders an incomplete stub without inventing values", () => {
    const item = toListItem(rowFor(SEED_SUBSCRIPTION_IDS.disneyPlus), "2026-06-15");

    expect(item.amount.value).toBeNull();
    expect(item.cadence.value).toBeNull();
    expect(item.nextRenewal.value).toBeNull();
    expect(item.trialEndsOn.value).toBeNull();
    expect(item.autoRenewal.value).toBeNull();
    expect(item.monthlyEquivalentMinor).toBeNull();
  });
});
