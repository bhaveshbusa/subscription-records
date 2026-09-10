import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { toProposalView } from "@/lib/proposals/projection";
import {
  parseRetargetBody,
  retargetProposal,
  type RetargetError,
} from "@/lib/proposals/retarget";
import { readJsonBody } from "@/lib/subscriptions/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_BY_ERROR: Record<RetargetError, number> = {
  not_found: 404,
  subscription_not_found: 404,
  not_pending: 409,
  unsupported_kind: 409,
  invalid_payload: 422,
};

/**
 * Retargeting is a decision about identity, not about terms: it never confirms
 * money or dates, and it never writes a ledger row. Accepting is still what
 * applies the card.
 */
export async function POST(
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

  const body = parseRetargetBody(await readJsonBody(request));

  if (!body.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: body.issues },
      { status: 400 },
    );
  }

  const result = await getDb().transaction((tx) =>
    retargetProposal(tx, { userId, id, action: body.action }),
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.issues ? { issues: result.issues } : {}),
      },
      { status: STATUS_BY_ERROR[result.error] },
    );
  }

  return NextResponse.json({
    proposal: toProposalView(result.proposal, result.subscriptionProvider),
    options: result.options,
    retargeted: result.retargeted,
  });
}
