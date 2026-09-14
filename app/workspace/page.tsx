import { Suspense } from "react";

import { signOut } from "@/auth";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default function WorkspacePage() {
  return (
    <main className="min-h-screen">
      <Suspense
        fallback={
          <p className="mx-auto w-full max-w-[90rem] px-4 pt-8 text-sm text-ui-muted sm:px-8">
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
                className="ui-button"
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
