import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { getInboxSections } from "@/lib/inbox/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_SECTIONS = { overdue: [], unfinished: [], reminders: [] };

/**
 * The ledger side of Inbox: overdue holdings, unfinished rows, and reminder
 * notifications. Read-only and projected on every request — Inbox stores nothing
 * of its own, so opening it cannot expire a card by writing acknowledgement.
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
