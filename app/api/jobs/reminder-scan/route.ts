import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { RENEWAL_LEAD_DAYS, renewalHorizon, scanForReminders } from "@/lib/jobs/reminder-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runs the reminder scan now, over the signed-in user's own rows, and answers
 * with what it raised. It is the same scan the nightly cron runs, so a preview
 * can be tested without waiting for 7am or having Inngest keys.
 *
 * Nothing here changes a subscription: a reminder is a note in the inbox, and
 * dismissing it is the only thing that can happen to it.
 */
export async function POST() {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!sessionUser.userId) {
    return NextResponse.json({ error: "no_user_record" }, { status: 403 });
  }

  const now = new Date();
  const result = await scanForReminders(getDb(), { userId: sessionUser.userId, now });

  return NextResponse.json({
    leadDays: RENEWAL_LEAD_DAYS,
    /** Renewals up to and including this date are close enough to mention. */
    renewalHorizon: renewalHorizon(now),
    ...result,
  });
}
