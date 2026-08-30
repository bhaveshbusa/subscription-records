import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { LAPSE_GRACE_DAYS, lapseCutoff, scanForLapses } from "@/lib/jobs/lapse-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runs the lapse scan now, over the signed-in user's own rows, and answers with
 * what it raised. It is the same scan the nightly cron runs, so a preview can be
 * tested without waiting for 7am or having Inngest keys.
 *
 * Nothing here changes a subscription: every finding is a pending proposal in the
 * inbox until the user accepts it.
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
  const result = await scanForLapses(getDb(), { userId: sessionUser.userId, now });

  return NextResponse.json({
    graceDays: LAPSE_GRACE_DAYS,
    /** Renewals on or after this date are still within the grace period. */
    renewalCutoff: lapseCutoff(now),
    ...result,
  });
}
