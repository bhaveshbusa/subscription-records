import Link from "next/link";

import { CaptureChat } from "./capture-chat";

export default function ChatPage() {
  return (
    <main className="min-h-screen px-6 py-8 sm:px-10">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-800">
            Subscription records
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">Chat</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            Tell me what you subscribed to, or paste a list. You get proposals to review —
            nothing reaches your ledger until you accept it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500"
            href="/inbox"
          >
            Inbox
          </Link>
          <Link
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-500"
            href="/ledger"
          >
            Subscriptions
          </Link>
        </div>
      </header>
      <CaptureChat />
    </main>
  );
}
