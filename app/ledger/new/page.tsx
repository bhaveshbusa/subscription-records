import Link from "next/link";

import { EMPTY_SUBSCRIPTION_FORM } from "@/lib/subscriptions/form-values";

import { SubscriptionForm } from "../subscription-form";

export default function NewSubscriptionPage() {
  return (
    <main className="min-h-screen px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <Link
          className="text-sm font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700"
          href="/ledger"
        >
          ← Back to ledger
        </Link>
        <header className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-800">
            New record
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">
            Add a subscription
          </h1>
          <p className="mt-2 text-stone-600">
            Save what you know now. A provider name on its own is a valid record.
          </p>
        </header>
        <SubscriptionForm initial={EMPTY_SUBSCRIPTION_FORM} target={{ mode: "create" }} />
      </div>
    </main>
  );
}
