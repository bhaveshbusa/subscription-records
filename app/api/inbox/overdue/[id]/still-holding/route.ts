import { respondToOverdue } from "@/lib/inbox/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "I still have this." Rolls the passed due date forward by cadence and marks
 * it inferred. The user is telling us they hold the subscription, not that they
 * checked the date, so the date never lands `confirmed`.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return respondToOverdue(request, context, "still_holding");
}
