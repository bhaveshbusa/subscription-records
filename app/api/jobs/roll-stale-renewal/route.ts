import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { rollStaleRenewals } from "@/lib/jobs/roll-stale-renewal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rolls stale `next_renewal` dates on the signed-in user's holding rows. It is
 * the same job the nightly cron runs. It writes those rows; it never proposes
 * `lapsed`. A passed date is a stale schedule, not evidence the subscription
 * stopped.
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
  const result = await rollStaleRenewals(getDb(), { userId: sessionUser.userId, now });

  return NextResponse.json(result);
}
