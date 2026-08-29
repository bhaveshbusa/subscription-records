import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { extractCandidates, ExtractorUnavailableError } from "@/lib/capture/extract";
import { parseChatMessageBody } from "@/lib/capture/message";
import { recordChatCapture } from "@/lib/capture/record";
import { getDb } from "@/lib/db";
import { readJsonBody } from "@/lib/subscriptions/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!sessionUser.userId) {
    return NextResponse.json({ error: "no_user_record" }, { status: 403 });
  }

  const parsed = parseChatMessageBody(await readJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.issues },
      { status: 400 },
    );
  }

  const text = parsed.input.message;
  let extraction;

  try {
    extraction = await extractCandidates(text);
  } catch (error) {
    if (error instanceof ExtractorUnavailableError) {
      return NextResponse.json(
        { error: "extractor_unavailable", message: error.message },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error: "extraction_failed",
        message: error instanceof Error ? error.message : "extraction failed",
      },
      { status: 502 },
    );
  }

  const userId = sessionUser.userId;
  /** One transaction, so a message never lands without its proposals. */
  const result = await getDb().transaction((tx) =>
    recordChatCapture(tx, { userId, text, extraction }),
  );

  return NextResponse.json(result, { status: 201 });
}
