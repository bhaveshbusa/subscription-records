import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { parseListQuery } from "@/lib/subscriptions/params";
import { listSubscriptions } from "@/lib/subscriptions/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = parseListQuery(new URL(request.url).searchParams);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.issues },
      { status: 400 },
    );
  }

  if (!sessionUser.userId) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  const result = await listSubscriptions(getDb(), {
    userId: sessionUser.userId,
    query: parsed.query,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "invalid_query", issues: [{ field: "cursor", message: "cursor is not valid for this query" }] },
      { status: 400 },
    );
  }

  return NextResponse.json({ items: result.items, nextCursor: result.nextCursor });
}
