import { redirect } from "next/navigation";

import { legacyWorkspaceHref, toSearchParams } from "@/lib/workspace/view";

/**
 * A record is no longer its own page: it opens inline in the subscription list
 * with the conversation about it. An existing link to one still reaches it.
 */
export default async function SubscriptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);

  redirect(
    legacyWorkspaceHref(toSearchParams(search), { recordId: id }),
  );
}
