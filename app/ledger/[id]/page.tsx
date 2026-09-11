import { redirect } from "next/navigation";

import { legacyWorkspaceHref, toSearchParams } from "@/lib/workspace/view";

/**
 * A record is no longer its own page: it opens in the workspace beside the
 * conversation about it. An existing link to one still reaches that record.
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
    legacyWorkspaceHref(toSearchParams(search), {
      view: "subscriptions",
      recordId: id,
      pane: "record",
    }),
  );
}
