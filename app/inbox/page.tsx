import { Suspense } from "react";
import Link from "next/link";

import { isSeedLoginEnabled } from "@/lib/deployment";

import { ProposalInbox } from "./proposal-inbox";

export default function InboxPage() {
  return (
    <main className="min-h-screen px-6 py-8 sm:px-10">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-800">
            Subscription records
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">Inbox</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Nothing here is in your ledger yet. Accept a proposal to write it, and prices and
            dates stay proposed until you confirm them yourself.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500"
            href="/chat"
          >
            Chat
          </Link>
          <Link
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500"
            href="/ledger"
          >
            Subscriptions
          </Link>
        </div>
      </header>
      <Suspense
        fallback={
          <p className="mx-auto mt-10 w-full max-w-5xl text-sm text-stone-600">Loading inbox…</p>
        }
      >
        <ProposalInbox showLapseScan={isSeedLoginEnabled()} />
      </Suspense>
    </main>
  );
}
