import { z } from "zod";

import { getDb } from "@/lib/db";

import { inngest, REMINDER_SCAN_REQUESTED, ROLL_STALE_RENEWAL_REQUESTED } from "./inngest";
import { scanForReminders } from "./reminder-scan";
import { rollStaleRenewals } from "./roll-stale-renewal";

/** Early enough to be waiting in the inbox, late enough that yesterday is over. */
export const ROLL_STALE_RENEWAL_CRON = "TZ=Europe/London 0 7 * * *";

/** Just after the stale-renewal roll, so a morning's inbox is filled in one go. */
export const REMINDER_SCAN_CRON = "TZ=Europe/London 15 7 * * *";

const scanRequestSchema = z.object({ userId: z.string().uuid().optional() }).optional();

/** One user's rows when the request names one, everybody's when it does not. */
function requestedUserId(data: unknown): string | null {
  const parsed = scanRequestSchema.safeParse(data);

  return parsed.success ? (parsed.data?.userId ?? null) : null;
}

export const dailyRollStaleRenewal = inngest.createFunction(
  {
    id: "daily-roll-stale-renewal",
    name: "Daily roll stale renewal",
    triggers: [{ cron: ROLL_STALE_RENEWAL_CRON }],
  },
  async ({ step }) =>
    step.run("roll-stale-renewal", () => rollStaleRenewals(getDb(), { now: new Date() })),
);

export const requestedRollStaleRenewal = inngest.createFunction(
  {
    id: "requested-roll-stale-renewal",
    name: "Roll stale renewal on request",
    triggers: [{ event: ROLL_STALE_RENEWAL_REQUESTED }],
  },
  async ({ event, step }) =>
    step.run("roll-stale-renewal", () =>
      rollStaleRenewals(getDb(), { userId: requestedUserId(event.data), now: new Date() }),
    ),
);

export const dailyReminderScan = inngest.createFunction(
  {
    id: "daily-reminder-scan",
    name: "Daily reminder scan",
    triggers: [{ cron: REMINDER_SCAN_CRON }],
  },
  async ({ step }) =>
    step.run("scan-for-reminders", () => scanForReminders(getDb(), { now: new Date() })),
);

export const requestedReminderScan = inngest.createFunction(
  {
    id: "requested-reminder-scan",
    name: "Reminder scan on request",
    triggers: [{ event: REMINDER_SCAN_REQUESTED }],
  },
  async ({ event, step }) =>
    step.run("scan-for-reminders", () =>
      scanForReminders(getDb(), { userId: requestedUserId(event.data), now: new Date() }),
    ),
);

export const jobFunctions = [
  dailyRollStaleRenewal,
  requestedRollStaleRenewal,
  dailyReminderScan,
  requestedReminderScan,
];
