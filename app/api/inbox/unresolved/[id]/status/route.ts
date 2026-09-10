import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import {
  setUnresolvedStatus,
  unresolvedStatusBodySchema,
  type UnresolvedFailure,
} from "@/lib/inbox/unresolved";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Why the row could not take the answer, in the words the card shows. */
const REFUSALS: Record<UnresolvedFailure, { status: number; message: string }> = {
  not_found: { status: 404, message: "That subscription is not in your ledger." },
  already_resolved: {
    status: 409,
    message:
      "That subscription already has a status. Reload your inbox, or open the record to change it.",
  },
};

/**
 * "This one is active." A status-only answer to a row the ledger could not read:
 * it writes the status and nothing else, so no renewal date is rolled and no
 * money is confirmed on the way through.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const userId = sessionUser.userId;

  if (!userId) {
    return NextResponse.json({ error: "no_user_record" }, { status: 403 });
  }

  const parsed = unresolvedStatusBodySchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: "Say whether it is active, a trial, or paused. Ending it is a cancellation.",
      },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const outcome = await setUnresolvedStatus(getDb(), {
    userId,
    id,
    status: parsed.data.status,
  });

  if (!outcome.ok) {
    const refusal = REFUSALS[outcome.error];

    return NextResponse.json(
      { error: outcome.error, message: refusal.message },
      { status: refusal.status },
    );
  }

  return NextResponse.json(outcome);
}
