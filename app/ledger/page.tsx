import { signOut } from "@/auth";

export default function LedgerPage() {
  return (
    <main className="min-h-screen px-6 py-8 sm:px-10">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-800">
            Subscription records
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">
            Subscriptions
          </h1>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </header>
      <section className="mx-auto mt-16 max-w-5xl rounded-3xl border border-dashed border-stone-300 bg-white/60 px-8 py-16 text-center">
        <p className="text-lg font-medium text-stone-800">The ledger is ready for its data.</p>
        <p className="mt-2 text-sm text-stone-500">
          Schema and subscription rows arrive in the next foundation issues.
        </p>
      </section>
    </main>
  );
}
