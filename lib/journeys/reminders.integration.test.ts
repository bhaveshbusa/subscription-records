import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import {
  amendments,
  events,
  subscriptionReminderPreferences,
  subscriptions,
  users,
} from "@/lib/db/schema";

import { journeyId, journeyUser, noonOn, shareConnection, type Db } from "./harness";

/**
 * Journey E — Inbox reminders appear, then expire by date (SUB-50).
 *
 * The other suites cover reminder eligibility with fixtures at different
 * offsets from the real today. That proves the rule but not the thing a person
 * actually experiences: *one* holding, watched across the days either side of
 * its window. So this file freezes the clock and walks a single occurrence
 * through all four boundary days named in the acceptance criteria — the day
 * before the window opens, the day it opens, the due date, and the day after.
 *
 * `toFake: ["Date"]` only. Faking timers wholesale would replace the
 * `setTimeout` that `pg` relies on and hang the connection; the routes read the
 * calendar through `new Date()`, so Date alone is enough to move the day.
 */

const USER = journeyUser(0x04, "reminders");

const YEARLY_ID = journeyId(0x04, 0x01);
const TRIAL_ID = journeyId(0x04, 0x02);
const YEARLY_PREF_ID = journeyId(0x04, 0x11);
const TRIAL_PREF_ID = journeyId(0x04, 0x12);

/** Fixed calendar, so every boundary in this file is arithmetic, not drift. */
const DUE_DATE = "2027-03-15";
/** One calendar month before the due date, the suggested yearly lead. */
const WINDOW_OPENS = "2027-02-15";
const DAY_BEFORE_WINDOW = "2027-02-14";
const DAY_AFTER_DUE = "2027-03-16";

const TRIAL_ENDS = "2027-02-20";
/** Three calendar days before trial end, the suggested trial lead. */
const TRIAL_WINDOW_OPENS = "2027-02-17";
const DAY_AFTER_TRIAL_END = "2027-02-21";

const state = vi.hoisted(() => ({
  email: null as string | null,
  db: null as unknown,
}));

vi.mock("@/auth", () => ({
  auth: async () => (state.email ? { user: { email: state.email } } : null),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => state.db,
  closeDb: async () => {},
}));

const { GET: inboxRoute } = await import("@/app/api/inbox/route");

type Reminder = {
  id: string;
  target: "renewal" | "trial_end";
  dueDate: string;
  reminderDate: string;
  basis: "expected" | "recorded";
  item: { provider: { value: string } };
};

type InboxBody = {
  overdue: { provider: { value: string } }[];
  unfinished: { provider: { value: string } }[];
  reminders: Reminder[];
};

async function inbox() {
  const response = await inboxRoute();

  return (await response.json()) as InboxBody;
}

/** Read Inbox as if it were `date`, then put the clock back. */
async function inboxOn(date: string) {
  vi.setSystemTime(noonOn(date));

  return await inbox();
}

function providersOf(reminders: Reminder[]) {
  return reminders.map((reminder) => reminder.item.provider.value);
}

const confirmed = {
  provider_field_status: "confirmed",
  amount_field_status: "confirmed",
  cadence_field_status: "confirmed",
  renewal_field_status: "confirmed",
  status_field_status: "confirmed",
} as const;

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)("journey: Inbox reminders expire by date", () => {
  let client: Client;
  let db: Db;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("begin");
    db = drizzle(client, { schema });
    state.db = shareConnection(db);

    await db.insert(users).values({ id: USER.id, name: USER.name, email: USER.email });

    await db.insert(subscriptions).values([
      {
        id: YEARLY_ID,
        user_id: USER.id,
        provider_canonical: "yearly-with-reminder",
        provider_display: "Yearly With Reminder",
        status: "active",
        currency: "GBP",
        cadence: "yearly",
        amount_minor: 12000,
        next_renewal: DUE_DATE,
        auto_renewal: "yes",
        auto_renewal_field_status: "confirmed",
        ...confirmed,
      },
      {
        id: TRIAL_ID,
        user_id: USER.id,
        provider_canonical: "trial-with-reminder",
        provider_display: "Trial With Reminder",
        status: "trial",
        currency: "GBP",
        /** The paid plan after trial: stated, but never confirmed by a date. */
        cadence: "monthly",
        amount_minor: 1000,
        next_renewal: null,
        trial_ends_on: TRIAL_ENDS,
        trial_end_field_status: "confirmed",
        ...confirmed,
        amount_field_status: "proposed",
        renewal_field_status: "empty",
      },
    ]);

    await db.insert(subscriptionReminderPreferences).values([
      {
        id: YEARLY_PREF_ID,
        user_id: USER.id,
        subscription_id: YEARLY_ID,
        target: "renewal",
        state: "enabled",
        lead_value: 1,
        lead_unit: "months",
      },
      {
        id: TRIAL_PREF_ID,
        user_id: USER.id,
        subscription_id: TRIAL_ID,
        target: "trial_end",
        state: "enabled",
        lead_value: 3,
        lead_unit: "days",
      },
    ]);

    state.email = USER.email;
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterAll(async () => {
    vi.useRealTimers();
    await client.query("rollback");
    await client.end();
  });

  afterEach(() => {
    vi.setSystemTime(noonOn(DUE_DATE));
  });

  it("is absent the day before the window opens", async () => {
    const body = await inboxOn(DAY_BEFORE_WINDOW);

    expect(providersOf(body.reminders)).not.toContain("Yearly With Reminder");
  });

  it("appears on the first day of the window, labelled with its lead date", async () => {
    const body = await inboxOn(WINDOW_OPENS);
    const card = body.reminders.find(
      (reminder) => reminder.item.provider.value === "Yearly With Reminder",
    );

    expect(card).toBeDefined();
    expect(card).toMatchObject({
      target: "renewal",
      dueDate: DUE_DATE,
      reminderDate: WINDOW_OPENS,
    });
  });

  it("is still there on the due date itself", async () => {
    const body = await inboxOn(DUE_DATE);
    const card = body.reminders.find(
      (reminder) => reminder.item.provider.value === "Yearly With Reminder",
    );

    expect(card).toBeDefined();
    expect(card?.dueDate).toBe(DUE_DATE);
  });

  it("is gone the next calendar day, with no dismiss action anywhere", async () => {
    const body = await inboxOn(DAY_AFTER_DUE);
    const card = body.reminders.find(
      (reminder) => reminder.item.provider.value === "Yearly With Reminder",
    );

    /**
     * Gone for this occurrence. The next one is a year out, so its own window
     * has not opened — expiry is not the card surviving under a new date.
     */
    expect(card).toBeUndefined();
  });

  it("expires without writing to any table", async () => {
    vi.setSystemTime(noonOn(DUE_DATE));

    const before = {
      subscriptions: await db.select().from(subscriptions).orderBy(subscriptions.id),
      preferences: await db
        .select()
        .from(subscriptionReminderPreferences)
        .orderBy(subscriptionReminderPreferences.id),
      amendments: await db.select().from(amendments).orderBy(amendments.id),
      events: await db.select().from(events).orderBy(events.id),
    };

    /** Read it inside the window, then past it. Expiry is a read, not a write. */
    await inboxOn(DUE_DATE);
    await inboxOn(DAY_AFTER_DUE);
    await inboxOn(DAY_AFTER_DUE);

    expect(await db.select().from(subscriptions).orderBy(subscriptions.id)).toEqual(
      before.subscriptions,
    );
    expect(
      await db
        .select()
        .from(subscriptionReminderPreferences)
        .orderBy(subscriptionReminderPreferences.id),
    ).toEqual(before.preferences);
    expect(await db.select().from(amendments).orderBy(amendments.id)).toEqual(before.amendments);
    expect(await db.select().from(events).orderBy(events.id)).toEqual(before.events);
  });

  it("leaves the holding itself untouched after the reminder expires", async () => {
    await inboxOn(DAY_AFTER_DUE);

    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, YEARLY_ID));

    expect(row.status).toBe("active");
    expect(row.next_renewal).toBe(DUE_DATE);
    expect(row.renewal_field_status).toBe("confirmed");
  });

  it("does not put a confirmed auto-renewing row into Overdue once its date passes", async () => {
    const body = await inboxOn(DAY_AFTER_DUE);

    /** SUB-48: routine renewal is not reconciliation work. */
    expect(body.overdue.map((item) => item.provider.value)).not.toContain(
      "Yearly With Reminder",
    );
  });

  it("opens the trial reminder three days before trial end", async () => {
    expect(providersOf((await inboxOn("2027-02-16")).reminders)).not.toContain(
      "Trial With Reminder",
    );

    const card = (await inboxOn(TRIAL_WINDOW_OPENS)).reminders.find(
      (reminder) => reminder.item.provider.value === "Trial With Reminder",
    );

    expect(card).toMatchObject({
      target: "trial_end",
      dueDate: TRIAL_ENDS,
      reminderDate: TRIAL_WINDOW_OPENS,
    });
  });

  it("keeps the trial reminder visible on trial end and drops it the day after", async () => {
    expect(providersOf((await inboxOn(TRIAL_ENDS)).reminders)).toContain(
      "Trial With Reminder",
    );
    expect(providersOf((await inboxOn(DAY_AFTER_TRIAL_END)).reminders)).not.toContain(
      "Trial With Reminder",
    );
  });

  it("does not convert the trial to paid when its reminder expires", async () => {
    await inboxOn(DAY_AFTER_TRIAL_END);

    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, TRIAL_ID));

    expect(row.status).toBe("trial");
    expect(row.trial_ends_on).toBe(TRIAL_ENDS);
    expect(row.next_renewal).toBeNull();
    /** The stated paid plan is still only stated. */
    expect(row.amount_field_status).toBe("proposed");
  });

  it("keeps the unresolved trial visible after its reminder is gone", async () => {
    const body = await inboxOn(DAY_AFTER_TRIAL_END);

    /**
     * The reminder expiring is not the question being answered: a passed trial
     * end is still reconciliation work until the user says what happened.
     */
    expect(providersOf(body.reminders)).not.toContain("Trial With Reminder");
    expect(body.overdue.map((item) => item.provider.value)).toContain("Trial With Reminder");
  });

  it("produces one card per occurrence, however many times Inbox is opened", async () => {
    vi.setSystemTime(noonOn(WINDOW_OPENS));

    const first = (await inbox()).reminders.map((reminder) => reminder.id).sort();
    const second = (await inbox()).reminders.map((reminder) => reminder.id).sort();
    const third = (await inbox()).reminders.map((reminder) => reminder.id).sort();

    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(new Set(first).size).toBe(first.length);
    /** Reopening does not clear it either. */
    expect(first.length).toBeGreaterThan(0);
  });

  it("gives a later occurrence its own window rather than reviving the old card", async () => {
    const thisYear = (await inboxOn(WINDOW_OPENS)).reminders.find(
      (reminder) => reminder.item.provider.value === "Yearly With Reminder",
    );
    const nextYear = (await inboxOn("2028-02-15")).reminders.find(
      (reminder) => reminder.item.provider.value === "Yearly With Reminder",
    );

    expect(thisYear).toBeDefined();
    expect(nextYear).toBeDefined();
    /** A new occurrence: different due date, different identity. */
    expect(nextYear?.dueDate).toBe("2028-03-15");
    expect(nextYear?.id).not.toBe(thisYear?.id);
    /** And it is projected, so it says so. */
    expect(nextYear?.basis).toBe("expected");
  });
});
