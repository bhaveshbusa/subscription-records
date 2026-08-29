import Link from "next/link";

export default function SubscriptionNotFound() {
  return (
    <main className="min-h-screen px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <Link
          className="text-sm font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-700"
          href="/ledger"
        >
          ← Back to ledger
        </Link>
        <section className="mt-10 rounded-3xl border border-stone-200 bg-white/80 p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
            Subscription not found
          </h1>
          <p className="mt-3 text-sm text-stone-600">
            This record does not exist or belongs to a different account.
          </p>
        </section>
      </div>
    </main>
  );
}
