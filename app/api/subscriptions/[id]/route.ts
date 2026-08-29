import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { getSubscriptionDetail } from "@/lib/subscriptions/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const subscription = sessionUser.userId
    ? await getSubscriptionDetail(getDb(), { userId: sessionUser.userId, id })
    : null;

  if (!subscription) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(subscription);
}
