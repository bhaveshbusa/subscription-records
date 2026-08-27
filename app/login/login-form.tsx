"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { authenticate } from "@/app/login/actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="mt-2 rounded-xl bg-emerald-950 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-70"
      disabled={pending}
      type="submit"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm() {
  const [errorMessage, formAction] = useActionState(authenticate, undefined);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
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
      <label className="flex flex-col gap-2 text-sm font-medium">
        Password
        <input
          autoComplete="current-password"
          className="rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          name="password"
          required
          type="password"
        />
      </label>
      {errorMessage ? (
        <p aria-live="polite" className="text-sm font-medium text-red-700">
          {errorMessage}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
