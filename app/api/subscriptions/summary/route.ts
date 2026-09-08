import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { emptySubscriptionSummary, getSummary } from "@/lib/subscriptions/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!sessionUser.userId) {
    return NextResponse.json(emptySubscriptionSummary());
  }

  return NextResponse.json(await getSummary(getDb(), { userId: sessionUser.userId }));
}
