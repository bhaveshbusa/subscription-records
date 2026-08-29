import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { listProposals, parseProposalQuery } from "@/lib/proposals/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = parseProposalQuery(new URL(request.url).searchParams);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.issues },
      { status: 400 },
    );
  }

  if (!sessionUser.userId) {
    return NextResponse.json({ items: [] });
  }

  const items = await listProposals(getDb(), {
    userId: sessionUser.userId,
    query: parsed.query,
  });

  return NextResponse.json({ items });
}
