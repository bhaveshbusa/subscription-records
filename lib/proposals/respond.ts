import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { readJsonBody } from "@/lib/subscriptions/write";

import { parseAcceptBody, type ConfirmedTerms } from "./confirm";
import { acceptProposal, rejectProposal, type DecideError } from "./decide";
import { toProposalView } from "./projection";

const STATUS_BY_ERROR: Record<DecideError, number> = {
  not_found: 404,
  subscription_not_found: 404,
  not_pending: 409,
  unsupported_kind: 409,
  invalid_payload: 422,
};

/**
 * `accept` and `reject` differ only in the decision they record, and in the
 * terms an accept may confirm on the way through.
 */
export async function respondToProposal(
  decision: "accept" | "reject",
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const sessionUser = await getSessionUser();

  if (!sessionUser.authenticated) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const userId = sessionUser.userId;

  if (!userId) {
    return NextResponse.json({ error: "no_user_record" }, { status: 403 });
  }

  let confirm: ConfirmedTerms | undefined;

  if (decision === "accept") {
    const body = parseAcceptBody(await readJsonBody(request));

    if (!body.success) {
      return NextResponse.json(
        { error: "invalid_body", issues: body.issues },
        { status: 400 },
      );
    }

    confirm = body.confirm;
  }

  const result = await getDb().transaction((tx) =>
    decision === "accept"
      ? acceptProposal(tx, { userId, id, confirm })
      : rejectProposal(tx, { userId, id }),
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.issues ? { issues: result.issues } : {}) },
      { status: STATUS_BY_ERROR[result.error] },
    );
  }

  return NextResponse.json({
    proposal: toProposalView(result.proposal),
    subscriptionId: result.subscriptionId,
    conflicts: result.conflicts,
    ...(result.charge ? { charge: result.charge } : {}),
    ...(result.termsChange ? { termsChange: result.termsChange } : {}),
    ...(result.lifecycle ? { lifecycle: result.lifecycle } : {}),
  });
}
