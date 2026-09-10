import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { getInboxSections } from "@/lib/inbox/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_SECTIONS = { overdue: [], unfinished: [], reminders: [], questions: [] };

/**
 * Inbox work still open: overdue holdings, unfinished rows, reminder
 * notifications, and capture questions that were asked or put off. Read-only
 * for the ledger sections — opening Inbox cannot expire a card by writing
 * acknowledgement — and questions come from `loadOpenQuestions`.
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
