import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";

import { resolveOverdue, type OverdueAction, type OverdueFailure } from "./overdue";

/** Why the row could not take the action, in the words the card shows. */
const REFUSALS: Record<OverdueFailure, { status: number; message: string }> = {
  not_found: { status: 404, message: "That subscription is not in your ledger." },
  not_overdue: {
    status: 409,
    message: "That subscription is no longer overdue. Reload your inbox to see where it is.",
  },
  no_cadence: {
    status: 409,
    message:
      "This one has no billing cadence yet, so there is nothing to roll the date by. Add a cadence on the subscription first.",
  },
};

/**
 * The shared half of both Overdue actions: a session, the row's own id, and one
 * transaction so a cancellation's row, amendment, and event land together.
 */
export async function respondToOverdue(
  request: Request,
  context: { params: Promise<{ id: string }> },
  action: OverdueAction,
): Promise<NextResponse> {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!sessionUser.userId) {
    return NextResponse.json({ error: "no_user_record" }, { status: 403 });
  }

  const { id } = await context.params;
  const userId = sessionUser.userId;
  const outcome = await getDb().transaction((tx) =>
    resolveOverdue(tx, { userId, id, action }),
  );

  if (!outcome.ok) {
    const refusal = REFUSALS[outcome.error];

    return NextResponse.json(
      { error: outcome.error, message: refusal.message },
      { status: refusal.status },
    );
  }

  return NextResponse.json(outcome);
}
