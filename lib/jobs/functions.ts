import { z } from "zod";

import { getDb } from "@/lib/db";

import { inngest, LAPSE_SCAN_REQUESTED } from "./inngest";
import { scanForLapses } from "./lapse-scan";

/** Early enough to be waiting in the inbox, late enough that yesterday is over. */
export const LAPSE_SCAN_CRON = "TZ=Europe/London 0 7 * * *";

const lapseScanRequestSchema = z
  .object({ userId: z.string().uuid().optional() })
  .optional();

/** One user's rows when the request names one, everybody's when it does not. */
function requestedUserId(data: unknown): string | null {
  const parsed = lapseScanRequestSchema.safeParse(data);

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

export const jobFunctions = [dailyLapseScan, requestedLapseScan];
