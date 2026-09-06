import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { getInboxSections } from "@/lib/inbox/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_SECTIONS = { overdue: [], unfinished: [], renewingSoon: [] };

/**
 * The ledger side of Inbox: overdue holdings, unfinished rows, and what renews
 * soon. Read-only and projected on every request — Inbox stores nothing of its
 * own, so there is no state here to fall out of step with the ledger.
 */
export async function GET() {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!sessionUser.userId) {
    return NextResponse.json(EMPTY_SECTIONS);
  }

  return NextResponse.json(
    await getInboxSections(getDb(), { userId: sessionUser.userId }),
  );
}
