import { describe, expect, it } from "vitest";

import { parseProposalPayload } from "@/lib/proposals/payload";

import {
  createSeedData,
  SEED_AMENDMENT_IDS,
  SEED_EVENT_IDS,
  SEED_SUBSCRIPTION_IDS,
  SEED_USER_ID,
} from "./seed-data";

describe("subscription seed data", () => {
  const data = createSeedData(new Date("2026-01-15T12:00:00.000Z"));

  it("contains the required subscription mix", () => {
    expect(data.subscriptions).toHaveLength(15);
    expect(data.subscriptions.every((row) => row.currency === "GBP")).toBe(true);
    expect(
      data.subscriptions.every(
        (row) => row.amount_minor === null || Number.isInteger(row.amount_minor),
      ),
    ).toBe(true);
    expect(
      data.subscriptions.filter(
        (row) =>
          row.status === "active" && row.amount_field_status === "confirmed",
      ),
    ).toHaveLength(9);
    expect(
      data.subscriptions.filter(
        (row) =>
          row.status === "active" && row.amount_field_status === "inferred",
      ),
    ).toHaveLength(1);
    expect(data.subscriptions.filter((row) => row.status === "trial")).toHaveLength(
      2,
    );
    expect(
      data.subscriptions.filter((row) => row.status === "cancel_scheduled"),
    ).toHaveLength(1);
    expect(
      data.subscriptions.filter((row) => row.status === "cancelled"),
    ).toHaveLength(1);
    expect(
      data.subscriptions.filter(
        (row) =>
          row.status === "unknown" ||
          row.status === "lapsed" ||
          row.amount_field_status === "conflicted" ||
          row.renewal_field_status === "conflicted" ||
          row.deferred_until !== null,
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("has one open amendment and started event for every subscription", () => {
    expect(data.amendments).toHaveLength(data.subscriptions.length);
    expect(data.amendments.every((row) => row.effective_to === null)).toBe(true);
    expect(data.events).toHaveLength(data.subscriptions.length);
    expect(data.events.every((row) => row.type === "started")).toBe(true);

    const amendmentSubscriptionIds = new Set(
      data.amendments.map((row) => row.subscription_id),
    );
    const eventSubscriptionIds = new Set(
      data.events.map((row) => row.subscription_id),
    );
    expect(amendmentSubscriptionIds.size).toBe(data.subscriptions.length);
    expect(eventSubscriptionIds.size).toBe(data.subscriptions.length);

    const keyBySubscriptionId = new Map<
      string,
      keyof typeof SEED_AMENDMENT_IDS
    >(
      Object.entries(SEED_SUBSCRIPTION_IDS).map(([key, id]) => [
        id,
        key as keyof typeof SEED_AMENDMENT_IDS,
      ]),
    );
    const subscriptionById = new Map(
      data.subscriptions.map((subscription) => [subscription.id, subscription]),
    );
    for (const amendment of data.amendments) {
      const key = keyBySubscriptionId.get(amendment.subscription_id);
      expect(key).toBeDefined();
      expect(amendment.id).toBe(SEED_AMENDMENT_IDS[key!]);
    }
    for (const event of data.events) {
      const key = keyBySubscriptionId.get(event.subscription_id);
      expect(key).toBeDefined();
      expect(event.id).toBe(SEED_EVENT_IDS[key!]);
      const subscription = subscriptionById.get(event.subscription_id);
      if (subscription?.started_on) {
        expect(event.at.toISOString().slice(0, 10)).toBe(subscription.started_on);
      }
    }
  });

  it("uses unique fixed ids and scopes business rows to the seed user", () => {
    const ids = [
      data.user.id,
      ...data.subscriptions.map((row) => row.id),
      ...data.amendments.map((row) => row.id),
      ...data.events.map((row) => row.id),
      ...data.proposals.map((row) => row.id!),
    ];
    expect(new Set(ids).size).toBe(ids.length);

    for (const rows of [
      data.subscriptions,
      data.amendments,
      data.events,
      data.proposals,
    ]) {
      expect(rows.every((row) => row.user_id === SEED_USER_ID)).toBe(true);
    }
  });

  it("leaves a pending create proposal for a provider not in the ledger", () => {
    const providers = new Set(data.subscriptions.map((row) => row.provider_canonical));

    expect(data.proposals).toHaveLength(1);

    const [proposal] = data.proposals;
    const payload = parseProposalPayload("create", proposal.payload);

    expect(proposal).toMatchObject({ kind: "create", state: "pending", decided_at: null });
    expect(proposal.subscription_id).toBeNull();
    expect(payload.success).toBe(true);
    expect(payload.success && payload.payload).toMatchObject({
      provider: { value: "Substack" },
      amountMinor: { status: "proposed" },
      cadence: { status: "proposed" },
      nextRenewal: { status: "proposed" },
    });
    expect(providers.has("substack")).toBe(false);
  });

  it("leaves one active subscription whose due date is in the past", () => {
    const overdue = data.subscriptions.filter(
      (row) =>
        row.status === "active" &&
        typeof row.next_renewal === "string" &&
        row.next_renewal < "2026-01-08",
    );

    expect(overdue.map((row) => row.provider_canonical)).toEqual(["headspace"]);
  });

  it("carries a cadence fixture for every renewing-soon window", () => {
    const byKey = (id: string) =>
      data.subscriptions.find((row) => row.id === id);
    const yearly = byKey(SEED_SUBSCRIPTION_IDS.guardian);
    const weekly = byKey(SEED_SUBSCRIPTION_IDS.oddbox);

    /** Yearly inside 30 days, so the section has something to show. */
    expect(yearly).toMatchObject({ status: "active", cadence: "yearly" });
    expect(yearly!.next_renewal! > "2026-01-15").toBe(true);
    expect(yearly!.next_renewal! <= "2026-02-14").toBe(true);

    /** Weekly and due within days, so its absence from the section is real. */
    expect(weekly).toMatchObject({ status: "active", cadence: "weekly" });
    expect(weekly!.next_renewal! > "2026-01-15").toBe(true);
    expect(weekly!.next_renewal! <= "2026-01-22").toBe(true);
  });

  it("sets the scheduled cancellation end date", () => {
    const scheduled = data.subscriptions.find(
      (row) => row.status === "cancel_scheduled",
    );
    expect(scheduled?.next_renewal).not.toBeNull();
    expect(scheduled?.ends_on).not.toBeNull();
  });

  it("stores trial end separately from subscription end and next renewal", () => {
    const byKey = (id: string) => data.subscriptions.find((row) => row.id === id);
    const notion = byKey(SEED_SUBSCRIPTION_IDS.notion);
    const canva = byKey(SEED_SUBSCRIPTION_IDS.canva);

    expect(notion).toMatchObject({
      status: "trial",
      amount_minor: null,
      next_renewal: null,
      ends_on: null,
      trial_ends_on: "2026-01-21",
      trial_end_field_status: "proposed",
      auto_renewal: null,
      auto_renewal_field_status: "empty",
    });
    expect(canva).toMatchObject({
      status: "trial",
      amount_minor: 1000,
      cadence: "monthly",
      next_renewal: null,
      ends_on: null,
      trial_ends_on: "2026-01-29",
      trial_end_field_status: "confirmed",
      auto_renewal: null,
      auto_renewal_field_status: "empty",
    });
  });

  it("does not infer auto-renewal from cadence, and seeds yes/no/unknown", () => {
    const byKey = (id: string) => data.subscriptions.find((row) => row.id === id);

    expect(byKey(SEED_SUBSCRIPTION_IDS.netflix)).toMatchObject({
      cadence: "monthly",
      auto_renewal: "yes",
      auto_renewal_field_status: "confirmed",
    });
    expect(byKey(SEED_SUBSCRIPTION_IDS.athletic)).toMatchObject({
      auto_renewal: "no",
      auto_renewal_field_status: "confirmed",
    });
    expect(byKey(SEED_SUBSCRIPTION_IDS.github)).toMatchObject({
      cadence: "yearly",
      auto_renewal: null,
      auto_renewal_field_status: "empty",
    });
    expect(byKey(SEED_SUBSCRIPTION_IDS.canva)).toMatchObject({
      cadence: "monthly",
      auto_renewal: null,
      auto_renewal_field_status: "empty",
    });
  });
});
