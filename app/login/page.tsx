import { redirect } from "next/navigation";

import { requestMagicLink } from "@/app/login/actions";
import { LoginForm } from "@/app/login/login-form";
import { auth } from "@/auth";
import { isSeedLoginEnabled } from "@/lib/deployment";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    sent?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();

  if (session?.user) {
    redirect("/ledger");
  }

  const query = await searchParams;
  const seedLoginEnabled = isSeedLoginEnabled();

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white/90 p-8 shadow-[0_24px_80px_rgba(41,55,46,0.12)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-800">
          Subscription records
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-stone-950">
          Your inventory, without guesswork.
        </h1>
        <p className="mt-3 leading-7 text-stone-600">
          Sign in to review the subscriptions and terms you have confirmed.
        </p>

        {seedLoginEnabled ? (
          <>
            <LoginForm />
            <p className="mt-5 text-xs leading-5 text-stone-500">
              Preview access uses the seed credentials listed in the pull request.
            </p>
          </>
        ) : (
          <form action={requestMagicLink} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Email
              <input
                autoComplete="email"
                className="rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                name="email"
                required
                type="email"
              />
            </label>
            {query.error === "email" ? (
              <p className="text-sm font-medium text-red-700">Enter a valid email.</p>
            ) : null}
            {query.sent === "1" ? (
              <p className="text-sm text-emerald-800">
                Request accepted. Email delivery will be enabled with production storage.
              </p>
            ) : null}
            <button
              className="mt-2 rounded-xl bg-emerald-950 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800"
              type="submit"
            >
              Send sign-in link
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
