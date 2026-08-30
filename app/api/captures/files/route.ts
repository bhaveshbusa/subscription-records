import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { startFileCapture } from "@/lib/capture/file-capture";
import { parseFileCaptureBody } from "@/lib/capture/upload";
import { getDb } from "@/lib/db";
import { getObjectStore } from "@/lib/storage";
import { StorageUnavailableError } from "@/lib/storage/objects";
import { readJsonBody } from "@/lib/subscriptions/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Signs one upload of one screenshot or PDF to a key this server chose, and
 * records the capture waiting for it. The bytes go straight to the private
 * bucket: they never pass through here, and nothing handed back can read them
 * again.
 */
export async function POST(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!sessionUser.userId) {
    return NextResponse.json({ error: "no_user_record" }, { status: 403 });
  }

  const parsed = parseFileCaptureBody(await readJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.issues },
      { status: 400 },
    );
  }

  let store;

  try {
    store = getObjectStore();
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return NextResponse.json(
        { error: "storage_unavailable", message: error.message },
        { status: 503 },
      );
    }

    throw error;
  }

  const userId = sessionUser.userId;
  /** One transaction, so a capture never exists without the job that reads it. */
  const started = await getDb().transaction((tx) =>
    startFileCapture(tx, { userId, input: parsed.input, store }),
  );

  return NextResponse.json(started, { status: 201 });
}
