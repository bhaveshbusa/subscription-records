import { Suspense } from "react";

import { signOut } from "@/auth";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default function WorkspacePage() {
  return (
    <main className="min-h-screen">
      <Suspense
        fallback={
          <p className="mx-auto w-full max-w-[104rem] px-4 pt-8 text-sm text-stone-600 sm:px-8">
            Loading your workspace…
          </p>
        }
      >
        <WorkspaceShell
          account={
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
          }
        />
      </Suspense>
    </main>
  );
}
