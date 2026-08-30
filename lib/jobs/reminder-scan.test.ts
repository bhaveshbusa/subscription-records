import { describe, expect, it } from "vitest";

import {
  deferralDueOn,
  deferredReminderBody,
  deferredTermFields,
  remindersFor,
  renewalDueOn,
  renewalHorizon,
  renewalReminderBody,
} from "./reminder-scan";

const NOW = new Date("2026-03-20T09:00:00.000Z");

const row = {
  id: "00000000-0000-4000-8000-000000009001",
  user_id: "00000000-0000-4000-8000-000000000001",
  provider_display: "Netflix",
  status: "active" as const,
  amount_minor: 1599,
  currency: "GBP",
  cadence: "monthly" as const,
  next_renewal: "2026-03-23",
  renewal_field_status: "confirmed" as const,
  amount_field_status: "confirmed" as const,
  cadence_field_status: "confirmed" as const,
  deferred_until: null as Date | null,
};

describe("reminder window", () => {
  it("looks a week ahead", () => {
    expect(renewalHorizon(NOW)).toBe("2026-03-27");
  });

  it("reminds about renewals from today up to the horizon", () => {
    expect(renewalDueOn({ ...row, next_renewal: "2026-03-20" }, NOW)).toBe("2026-03-20");
    expect(renewalDueOn({ ...row, next_renewal: "2026-03-27" }, NOW)).toBe("2026-03-27");
    expect(renewalDueOn({ ...row, next_renewal: "2026-03-28" }, NOW)).toBeNull();
  });

  it("leaves an overdue renewal to the lapse scan", () => {
    expect(renewalDueOn({ ...row, next_renewal: "2026-03-19" }, NOW)).toBeNull();
  });

  it("only reminds about a subscription that is still billing", () => {
    expect(renewalDueOn({ ...row, status: "trial" }, NOW)).toBe("2026-03-23");
    expect(renewalDueOn({ ...row, status: "lapsed" }, NOW)).toBeNull();
    expect(renewalDueOn({ ...row, status: "cancelled" }, NOW)).toBeNull();
    expect(renewalDueOn({ ...row, next_renewal: null }, NOW)).toBeNull();
  });

  it("waits until the day the user asked to be asked again", () => {
    expect(deferralDueOn({ deferred_until: new Date("2026-03-18T09:00:00.000Z") }, NOW)).toBe(
      "2026-03-18",
    );
    expect(deferralDueOn({ deferred_until: new Date("2026-03-27T09:00:00.000Z") }, NOW)).toBeNull();
    expect(deferralDueOn({ deferred_until: null }, NOW)).toBeNull();
  });
});

describe("reminder wording", () => {
  it("says how sure the ledger is of a date it did not confirm", () => {
    const body = renewalReminderBody(
      { ...row, renewal_field_status: "proposed" },
      "2026-03-23",
      NOW,
    );

    expect(body).toContain("Netflix renews on 23 Mar 2026, in 3 days");
    expect(body).toContain("£15.99 monthly");
    expect(body).toContain("proposed and stays that way until you confirm it yourself");
  });

  it("does not claim an unconfirmed date is confirmed", () => {
    for (const status of ["empty", "proposed", "inferred", "deferred", "conflicted"] as const) {
      expect(
        renewalReminderBody({ ...row, renewal_field_status: status }, "2026-03-23", NOW),
      ).not.toContain("date you confirmed");
    }

    expect(renewalReminderBody(row, "2026-03-23", NOW)).toContain("the date you confirmed");
  });

  it("reads naturally when the renewal is today or tomorrow", () => {
    expect(renewalReminderBody(row, "2026-03-20", NOW)).toContain("renews today");
    expect(renewalReminderBody(row, "2026-03-21", NOW)).toContain("renews tomorrow");
  });

  it("leaves the price out when the ledger does not hold one", () => {
    expect(renewalReminderBody({ ...row, amount_minor: null }, "2026-03-23", NOW)).toBe(
      "Netflix renews on 23 Mar 2026, in 3 days. This is the date you confirmed.",
    );
  });

  it("names every term that was put off, and says nothing was filled in", () => {
    const deferred = {
      ...row,
      amount_field_status: "deferred" as const,
      cadence_field_status: "deferred" as const,
    };

    expect(deferredTermFields(deferred)).toEqual(["amount", "cadence"]);

    const body = deferredReminderBody(deferred, "2026-03-18");

    expect(body).toContain("You put off the price and how often it bills for Netflix");
    expect(body).toContain("Nothing has been filled in for you");
    expect(body).toContain("fields are still waiting for your answer");
  });
});

describe("reminders for a subscription", () => {
  it("raises nothing when neither a deferral nor a renewal is due", () => {
    expect(remindersFor({ ...row, next_renewal: "2026-05-01" }, NOW)).toEqual([]);
  });

  it("raises both when a renewal is close and terms are still open", () => {
    const reminders = remindersFor(
      {
        ...row,
        amount_field_status: "deferred",
        deferred_until: new Date("2026-03-18T09:00:00.000Z"),
      },
      NOW,
    );

    expect(reminders.map((reminder) => reminder.kind)).toEqual([
      "deferred_terms",
      "upcoming_renewal",
    ]);
    expect(reminders[0].dueOn).toBe("2026-03-18");
    expect(reminders[1].dueOn).toBe("2026-03-23");
  });

  it("does not raise deferred terms when no field is deferred", () => {
    expect(
      remindersFor(
        { ...row, next_renewal: null, deferred_until: new Date("2026-03-18T09:00:00.000Z") },
        NOW,
      ),
    ).toEqual([]);
  });
});
