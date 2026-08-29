import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export type SessionUser =
  | { authenticated: false }
  | { authenticated: true; userId: string | null };

/**
 * The session only carries an email; ledger rows are keyed by `users.id`.
 * A signed-in email with no user row resolves to `null`, never an error.
 */
export async function getSessionUser(): Promise<SessionUser> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return { authenticated: false };
  }

  const [row] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return { authenticated: true, userId: row?.id ?? null };
}
