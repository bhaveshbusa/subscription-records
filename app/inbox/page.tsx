import { redirect } from "next/navigation";

import { legacyWorkspaceHref, toSearchParams } from "@/lib/workspace/view";

/**
 * Inbox is now the workspace's Work view. Its params travel with the link, so
 * an older `?about=` still selects what it named.
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyWorkspaceHref(toSearchParams(await searchParams), { view: "work" }));
}
