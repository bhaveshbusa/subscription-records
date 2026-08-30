import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { isImageMediaType, MAX_IMAGE_BYTES } from "@/lib/capture/image";
import { getObjectStore } from "@/lib/storage";
import { storageKeyPrefix } from "@/lib/storage/objects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The development stand-in for a signed bucket upload: a laptop with no bucket
 * credentials still needs somewhere for the bytes to go. It refuses to exist
 * once a bucket is configured, and it only writes under the caller's own key
 * prefix, so it is never a way to write into someone else's captures.
 */
export async function PUT(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!sessionUser.userId) {
    return NextResponse.json({ error: "no_user_record" }, { status: 403 });
  }

  const store = getObjectStore();

  if (store.label !== "local" || !store.write) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const key = new URL(request.url).searchParams.get("key");

  if (!key || !key.startsWith(storageKeyPrefix(sessionUser.userId))) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }

  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";

  if (!isImageMediaType(mediaType)) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());

  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "invalid_size" }, { status: 413 });
  }

  await store.write(key, bytes);

  return new NextResponse(null, { status: 204 });
}
