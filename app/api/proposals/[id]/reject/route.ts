import { respondToProposal } from "@/lib/proposals/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return respondToProposal("reject", request, context);
}
