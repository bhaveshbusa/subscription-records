import { z } from "zod";

import { getDb } from "@/lib/db";

import { inngest, LAPSE_SCAN_REQUESTED, REMINDER_SCAN_REQUESTED } from "./inngest";
import { scanForLapses } from "./lapse-scan";
import { scanForReminders } from "./reminder-scan";

/** Early enough to be waiting in the inbox, late enough that yesterday is over. */
export const LAPSE_SCAN_CRON = "TZ=Europe/London 0 7 * * *";

/** Just after the lapse scan, so a morning's inbox is filled in one go. */
export const REMINDER_SCAN_CRON = "TZ=Europe/London 15 7 * * *";

const scanRequestSchema = z.object({ userId: z.string().uuid().optional() }).optional();

/** One user's rows when the request names one, everybody's when it does not. */
function requestedUserId(data: unknown): string | null {
  const parsed = scanRequestSchema.safeParse(data);

  return parsed.success ? (parsed.data?.userId ?? null) : null;
}

export const dailyLapseScan = inngest.createFunction(
  {
    id: "daily-lapse-scan",
    name: "Daily lapse scan",
    triggers: [{ cron: LAPSE_SCAN_CRON }],
  },
  async ({ step }) =>
    step.run("scan-for-lapses", () => scanForLapses(getDb(), { now: new Date() })),
);

export const requestedLapseScan = inngest.createFunction(
  {
    id: "requested-lapse-scan",
    name: "Lapse scan on request",
    triggers: [{ event: LAPSE_SCAN_REQUESTED }],
  },
  async ({ event, step }) =>
    step.run("scan-for-lapses", () =>
      scanForLapses(getDb(), { userId: requestedUserId(event.data), now: new Date() }),
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
  dailyLapseScan,
  requestedLapseScan,
  dailyReminderScan,
  requestedReminderScan,
];
