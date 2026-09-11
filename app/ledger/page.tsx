import { redirect } from "next/navigation";

import { legacyWorkspaceHref, toSearchParams } from "@/lib/workspace/view";

/**
 * The ledger is now the workspace's Subscriptions view. The filter, search,
 * sort, and coverage params are read the same way there, so a bookmarked
 * filtered ledger still opens on what it asked for.
 */
export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(
    legacyWorkspaceHref(toSearchParams(await searchParams), { view: "subscriptions" }),
  );
}
