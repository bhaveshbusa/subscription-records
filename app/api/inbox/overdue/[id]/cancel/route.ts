import { respondToOverdue } from "@/lib/inbox/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "This stopped." Ends the row through the same lifecycle write an accepted
 * `cancelled` proposal uses, dated at the actual end date the user states.
 * If timing is unknown, the row stays unresolved and notes may be stored.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return respondToOverdue(request, context, "cancelled");
}
