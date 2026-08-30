import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { CaptureMissingError, readImageCapture } from "@/lib/capture/screenshot";
import { getDb } from "@/lib/db";
import { getObjectStore } from "@/lib/storage";
import { StorageUnavailableError } from "@/lib/storage/objects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reads an uploaded screenshot and answers with what it proposes. The run's
 * state lives in the database rather than in this request, so a repeat call
 * while a model is reading reports `reading` and one afterwards replays the
 * same cards instead of reading the image again.
 */
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
  const userId = sessionUser.userId;

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

  try {
    const reading = await readImageCapture(getDb(), { userId, captureId: id, store });

    return NextResponse.json(reading, { status: reading.state === "read" ? 201 : 200 });
  } catch (error) {
    if (error instanceof CaptureMissingError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    throw error;
  }
}
