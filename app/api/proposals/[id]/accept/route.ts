import { respondToProposal } from "@/lib/proposals/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return respondToProposal("accept", context);
}
