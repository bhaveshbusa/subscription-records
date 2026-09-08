import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";

import {
  overdueCancelBodySchema,
  resolveOverdue,
  type OverdueAction,
  type OverdueFailure,
} from "./overdue";

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
  no_renewal: {
    status: 409,
    message:
      "This trial's end has passed. Say whether it became paid, or cancel it with the actual end date — rolling a renewal is not that answer.",
  },
  needs_end_date: {
    status: 409,
    message:
      "Say when it ended. A stored renewal date is not the cancellation date. If you do not know, leave it unresolved and add a note.",
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
  let endsOn: string | undefined;
  let notes: string | undefined;
  let unknownTiming: boolean | undefined;

  if (action === "cancelled") {
    const raw = await request.json().catch(() => null);
    const parsed = overdueCancelBodySchema.safeParse(raw ?? {});

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "invalid_body",
          message: "Say when it ended as a real calendar date, or that the timing is unknown.",
        },
        { status: 400 },
      );
    }

    endsOn = parsed.data.endsOn;
    notes = parsed.data.notes;
    unknownTiming = parsed.data.unknownTiming;
  }

  const outcome = await getDb().transaction((tx) =>
    resolveOverdue(tx, { userId, id, action, endsOn, notes, unknownTiming }),
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
