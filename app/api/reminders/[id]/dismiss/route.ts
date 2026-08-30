import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { dismissReminder, type DismissError } from "@/lib/reminders/dismiss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_BY_ERROR: Record<DismissError, number> = {
  not_found: 404,
  not_pending: 409,
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!sessionUser.userId) {
    return NextResponse.json({ error: "no_user_record" }, { status: 403 });
  }

  const { id } = await context.params;
  const result = await dismissReminder(getDb(), { userId: sessionUser.userId, id });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: STATUS_BY_ERROR[result.error] });
  }

  return NextResponse.json({ reminder: result.reminder });
}
