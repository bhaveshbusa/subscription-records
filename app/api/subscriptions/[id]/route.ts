import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { getSubscriptionDetail } from "@/lib/subscriptions/query";
import {
  parseUpdateBody,
  readJsonBody,
  updateSubscription,
} from "@/lib/subscriptions/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const subscription = sessionUser.userId
    ? await getSubscriptionDetail(getDb(), { userId: sessionUser.userId, id })
    : null;

  if (!subscription) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(subscription);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = parseUpdateBody(await readJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.issues },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const userId = sessionUser.userId;

  /** Another user's id, or none at all, is indistinguishable from missing. */
  const row = userId
    ? await getDb().transaction((tx) =>
        updateSubscription(tx, { userId, id, input: parsed.input }),
      )
    : null;

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(
    await getSubscriptionDetail(getDb(), { userId: row.user_id, id: row.id }),
  );
}
