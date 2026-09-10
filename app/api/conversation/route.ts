import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { loadConversation, parseConversationQuery } from "@/lib/capture/conversation";
import { describeTarget, resolveCaptureTarget } from "@/lib/capture/target";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The conversation about one target, read back from the captures, proposals,
 * and questions it left behind, so a reload or a later visit shows what was
 * said about the selected record and where each result has got to. The target
 * is resolved under the session user first: a foreign or decided id is refused
 * rather than answered with an empty thread that looks like a fresh start.
 */
export async function GET(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!sessionUser.userId) {
    return NextResponse.json({ error: "no_user_record" }, { status: 403 });
  }

  const parsed = parseConversationQuery(new URL(request.url).searchParams);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query", message: parsed.message }, { status: 400 });
  }

  const userId = sessionUser.userId;
  const db = getDb();
  const resolved = await resolveCaptureTarget(db, userId, parsed.input);

  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.failure.error, message: resolved.failure.message },
      { status: resolved.failure.status },
    );
  }

  const turns = await loadConversation(db, { userId, target: parsed.input });

  return NextResponse.json({ target: describeTarget(resolved.target), turns });
}
