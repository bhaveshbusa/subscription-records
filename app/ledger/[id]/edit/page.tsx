import Link from "next/link";
import { notFound } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session-user";
import { getDb } from "@/lib/db";
import { toSubscriptionFormValues } from "@/lib/subscriptions/form-values";
import { getSubscriptionDetail } from "@/lib/subscriptions/query";

import { SubscriptionForm } from "../../subscription-form";

export default async function EditSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessionUser = await getSessionUser();
  const { id } = await params;

  if (!sessionUser.authenticated || !sessionUser.userId) {
    notFound();
  }

  const subscription = await getSubscriptionDetail(getDb(), {
    userId: sessionUser.userId,
    id,
  });

  if (!subscription) {
    notFound();
  }

  return (
    <main className="min-h-screen px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <Link
          className="text-sm font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700"
          href={`/ledger/${subscription.id}`}
        >
          ← Back to record
        </Link>
        <header className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-800">
            Edit record
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">
            {subscription.provider.value}
          </h1>
        </header>
        <SubscriptionForm
          initial={toSubscriptionFormValues(subscription)}
          target={{ mode: "edit", id: subscription.id }}
        />
      </div>
    </main>
  );
}
