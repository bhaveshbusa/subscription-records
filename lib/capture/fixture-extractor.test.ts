import { describe, expect, it } from "vitest";

import { extractWithFixtures } from "./fixture-extractor";

describe("fixture extractor", () => {
  it("reads one subscription from a sentence", () => {
    expect(extractWithFixtures("I subscribed to Linear")).toEqual([
      {
        provider: "Linear",
        amountMinor: null,
        currency: null,
        cadence: null,
        nextRenewal: null,
        paidOn: null,
        lifecycle: null,
        endsOn: null,
        confidence: "high",
        evidence: "I subscribed to Linear",
      },
    ]);
  });

  it("reads one candidate per name in a pasted list", () => {
    const candidates = extractWithFixtures(
      "Netflix\nSpotify\nNotion\n1Password",
    );

    expect(candidates.map((candidate) => candidate.provider)).toEqual([
      "Netflix",
      "Spotify",
      "Notion",
      "1Password",
    ]);
  });

  it("survives list markers, commas, and a greeting line", () => {
    const candidates = extractWithFixtures(
      "here's my list\n- Netflix\n2) Spotify\nNotion, Figma and Strava",
    );

    expect(candidates.map((candidate) => candidate.provider)).toEqual([
      "Netflix",
      "Spotify",
      "Notion",
      "Figma",
      "Strava",
    ]);
  });

  it("keeps a stated price, cadence, and renewal date", () => {
    const [candidate] = extractWithFixtures(
      "Netflix £15.99 per month renews 2026-09-12",
    );

    expect(candidate).toMatchObject({
      provider: "Netflix",
      amountMinor: 1599,
      currency: "GBP",
      cadence: "monthly",
      nextRenewal: "2026-09-12",
    });
  });

  it("reads a price written as a code, and a yearly cadence", () => {
    const [candidate] = extractWithFixtures(
      "I pay for Adobe 239.88 USD yearly",
    );

    expect(candidate).toMatchObject({
      provider: "Adobe",
      amountMinor: 23988,
      currency: "USD",
      cadence: "yearly",
    });
  });

  it("never invents a price, cadence, or date", () => {
    const [candidate] = extractWithFixtures("I signed up for Spotify");

    expect(candidate).toMatchObject({
      provider: "Spotify",
      amountMinor: null,
      currency: null,
      cadence: null,
      nextRenewal: null,
    });
  });

  it("reads a payment already made, dated against today", () => {
    const [candidate] = extractWithFixtures(
      "paid Spotify £10.99 today",
      new Date("2026-03-04T09:00:00.000Z"),
    );

    expect(candidate).toMatchObject({
      provider: "Spotify",
      amountMinor: 1099,
      currency: "GBP",
      paidOn: "2026-03-04",
      nextRenewal: null,
    });
  });

  it("dates yesterday's payment, and keeps a stated payment date", () => {
    const [yesterday] = extractWithFixtures(
      "Netflix charged me £15.99 yesterday",
      new Date("2026-03-01T09:00:00.000Z"),
    );
    const [stated] = extractWithFixtures("paid Figma $12 on 2026-02-11");

    expect(yesterday).toMatchObject({ provider: "Netflix", paidOn: "2026-02-28" });
    expect(stated).toMatchObject({
      provider: "Figma",
      paidOn: "2026-02-11",
      nextRenewal: null,
    });
  });

  it("treats a renewal that has not happened as a renewal, not a payment", () => {
    const [candidate] = extractWithFixtures("Netflix renews 2026-09-12");

    expect(candidate).toMatchObject({ nextRenewal: "2026-09-12", paidOn: null });
  });

  it("marks a name it does not recognise as low confidence", () => {
    const [candidate] = extractWithFixtures(
      "I subscribed to Perfect Pottery Club",
    );

    expect(candidate).toMatchObject({
      provider: "Perfect Pottery Club",
      confidence: "low",
    });
  });

  it("reads the name out of the way people say they have one", () => {
    expect(extractWithFixtures("I have a subscription for ABC")).toMatchObject([
      { provider: "ABC" },
    ]);
    expect(extractWithFixtures("my Netflix subscription")).toMatchObject([
      { provider: "Netflix" },
    ]);
    expect(extractWithFixtures("I use Figma")).toMatchObject([
      { provider: "Figma" },
    ]);
  });

  it("finds nothing in a message that names nothing", () => {
    expect(extractWithFixtures("hi")).toEqual([]);
    expect(extractWithFixtures("   ")).toEqual([]);
  });
});
