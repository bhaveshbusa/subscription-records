import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { getSummary } from "@/lib/subscriptions/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_SUMMARY = {
  activeCount: 0,
  trialCount: 0,
  needsAttentionCount: 0,
  monthlyEquivalentMinor: 0,
  currency: "GBP",
  nextRenewal: null,
};

export async function GET() {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!sessionUser.userId) {
    return NextResponse.json(EMPTY_SUMMARY);
  }

  return NextResponse.json(await getSummary(getDb(), { userId: sessionUser.userId }));
}
