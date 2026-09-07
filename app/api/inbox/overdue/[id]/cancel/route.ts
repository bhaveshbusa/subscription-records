import { respondToOverdue } from "@/lib/inbox/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "This stopped." Ends the row through the same lifecycle write an accepted
 * `cancelled` proposal uses, dated at the stored due date it never got past.
 * The subscription keeps its identity and its history.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return respondToOverdue(request, context, "cancelled");
}
