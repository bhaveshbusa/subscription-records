import { describe, expect, it } from "vitest";

import { extractWithFixtures } from "./fixture-extractor";

describe("fixture extractor", () => {
  it("reads one subscription from a sentence", () => {
    expect(extractWithFixtures("I subscribed to Linear")).toMatchObject([
      {
        provider: "Linear",
        accountHint: null,
        amountMinor: null,
        currency: null,
        cadence: null,
        nextRenewal: null,
        paidOn: null,
        subscriptionStatus: null,
        lifecycle: null,
        endsOn: null,
        trialEndsOn: null,
        autoRenewal: null,
        reminderPreferences: null,
        unsupportedStageOne: null,
        confidence: "high",
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

  it("reads a backdated cancellation as cancelled with a past end date", () => {
    const [candidate] = extractWithFixtures(
      "I cancelled Netflix three months ago",
      new Date("2026-09-04T12:00:00.000Z"),
    );

    expect(candidate).toMatchObject({
      provider: "Netflix",
      lifecycle: "cancelled",
      endsOn: "2026-06-04",
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

  it("reads a free trial with paid-plan terms and auto-renewal", () => {
    const [candidate] = extractWithFixtures(
      "Canva trial ends 14 September, then £10 monthly; auto-renew is on",
      new Date("2026-09-08T12:00:00.000Z"),
    );

    expect(candidate).toMatchObject({
      provider: "Canva",
      subscriptionStatus: "trial",
      trialEndsOn: "2026-09-14",
      amountMinor: 1000,
      currency: "GBP",
      cadence: "monthly",
      autoRenewal: "yes",
      nextRenewal: null,
      endsOn: null,
    });
  });

  it("carries a list's own introduction down to every line in it", () => {
    const candidates = extractWithFixtures(
      "These are my trial subscriptions:\nNotion\nCanva\nLinear",
      new Date("2026-09-08T12:00:00.000Z"),
    );

    expect(candidates.map((candidate) => candidate.provider)).toEqual([
      "Notion",
      "Canva",
      "Linear",
    ]);

    for (const candidate of candidates) {
      /** A trial with no end date stated is still a trial (SUB-60). */
      expect(candidate.subscriptionStatus).toBe("trial");
      expect(candidate.trialEndsOn).toBeNull();
    }
  });

  it("leaves an ordinary list alone: those lines are not trials", () => {
    const candidates = extractWithFixtures("Netflix\nSpotify\nNotion");

    for (const candidate of candidates) {
      expect(candidate.subscriptionStatus).toBeNull();
    }
  });

  it("accepts a trial without a paid price", () => {
    const [candidate] = extractWithFixtures(
      "Notion trial ends 2026-09-14",
      new Date("2026-09-08T12:00:00.000Z"),
    );

    expect(candidate).toMatchObject({
      provider: "Notion",
      subscriptionStatus: "trial",
      trialEndsOn: "2026-09-14",
      amountMinor: null,
    });
  });

  it("reads a reminder instruction and an explicit off", () => {
    const [enable] = extractWithFixtures("Remind me one month before GitHub renewal");
    const [off] = extractWithFixtures("Turn the GitHub reminder off");

    expect(enable).toMatchObject({
      provider: "GitHub",
      reminderPreferences: {
        renewal: { state: "enabled", leadValue: 1, leadUnit: "months" },
      },
    });
    expect(off).toMatchObject({
      provider: "GitHub",
      reminderPreferences: { renewal: { state: "off" } },
    });
  });

  it("still names The Athletic when the leftover article is part of the name", () => {
    expect(extractWithFixtures("The Athletic")).toMatchObject([{ provider: "The Athletic" }]);
  });

  it("does not treat remind-me-to-cancel as a reminder preference", () => {
    const [candidate] = extractWithFixtures("Remind me to cancel Netflix");

    expect(candidate.reminderPreferences).toBeNull();
  });

  it("surfaces a paid trial instead of rewriting it", () => {
    const [candidate] = extractWithFixtures(
      "Canva paid trial ends 2026-09-14 then £10 monthly",
    );

    expect(candidate).toMatchObject({
      provider: "Canva",
      subscriptionStatus: "trial",
      unsupportedStageOne: { reason: "paid_trial" },
    });
  });

  it("surfaces a first payment later than trial end instead of rewriting it", () => {
    const [candidate] = extractWithFixtures(
      "Canva trial ends 2026-09-14 then first payment on 2026-10-01",
      new Date("2026-09-08T12:00:00.000Z"),
    );

    expect(candidate).toMatchObject({
      provider: "Canva",
      subscriptionStatus: "trial",
      trialEndsOn: "2026-09-14",
      unsupportedStageOne: { reason: "different_payment_start" },
    });
  });
});
