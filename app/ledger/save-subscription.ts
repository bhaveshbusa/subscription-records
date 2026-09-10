import type { SubscriptionDetail } from "@/lib/subscriptions/projection";

export type SaveTarget = { mode: "create" } | { mode: "edit"; id: string };

type IssueBody = { issues?: { field: string; message: string }[] };

export async function saveSubscription(target: SaveTarget, body: unknown) {
  const response = await fetch(
    target.mode === "create" ? "/api/subscriptions" : `/api/subscriptions/${target.id}`,
    {
      method: target.mode === "create" ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (response.status === 401) {
    throw new Error("Your session has expired. Sign in again to save this record.");
  }

  if (response.status === 404) {
    throw new Error("This record does not exist or belongs to a different account.");
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as IssueBody;
    const issue = payload.issues?.[0];

    throw new Error(
      issue ? `${issue.field}: ${issue.message}` : "We couldn't save this record. Please try again.",
    );
  }

  return (await response.json()) as SubscriptionDetail;
}
