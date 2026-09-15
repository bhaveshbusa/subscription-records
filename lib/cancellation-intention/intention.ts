import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { subscriptionCancellationIntentions } from "@/lib/db/schema";
import { calendarDateSchema } from "@/lib/subscriptions/params";

/** Accepts the pool, a transaction, or a test double. */
export type IntentionClient = Pick<NodePgDatabase, "select" | "insert" | "update" | "delete">;

export type CancellationIntentionView = {
  remindOn: string;
};

export const cancellationIntentionInputSchema = z
  .object({
    remindOn: calendarDateSchema,
  })
  .strict();

export type CancellationIntentionInput = z.infer<typeof cancellationIntentionInputSchema>;

/** Payload / PATCH: set a remind date, or `null` to clear. */
export const cancellationIntentionPatchSchema = cancellationIntentionInputSchema.nullable();

export function toCancellationIntentionView(
  row: { remind_on: string } | null | undefined,
): CancellationIntentionView | null {
  return row ? { remindOn: row.remind_on } : null;
}

export async function loadCancellationIntention(
  client: Pick<NodePgDatabase, "select">,
  options: { userId: string; subscriptionId: string },
): Promise<CancellationIntentionView | null> {
  const [row] = await client
    .select({
      remind_on: subscriptionCancellationIntentions.remind_on,
    })
    .from(subscriptionCancellationIntentions)
    .where(
      and(
        eq(subscriptionCancellationIntentions.user_id, options.userId),
        eq(subscriptionCancellationIntentions.subscription_id, options.subscriptionId),
      ),
    )
    .limit(1);

  return toCancellationIntentionView(row);
}

export async function listOpenCancellationIntentions(
  client: Pick<NodePgDatabase, "select">,
  options: { userId: string },
): Promise<{ subscriptionId: string; remindOn: string }[]> {
  const rows = await client
    .select({
      subscriptionId: subscriptionCancellationIntentions.subscription_id,
      remindOn: subscriptionCancellationIntentions.remind_on,
    })
    .from(subscriptionCancellationIntentions)
    .where(eq(subscriptionCancellationIntentions.user_id, options.userId));

  return rows;
}

/** Upsert the open intention for a holding. */
export async function saveCancellationIntention(
  client: IntentionClient,
  options: {
    userId: string;
    subscriptionId: string;
    remindOn: string;
    now?: Date;
  },
): Promise<CancellationIntentionView> {
  const now = options.now ?? new Date();
  const scope = and(
    eq(subscriptionCancellationIntentions.user_id, options.userId),
    eq(subscriptionCancellationIntentions.subscription_id, options.subscriptionId),
  );

  const [updated] = await client
    .update(subscriptionCancellationIntentions)
    .set({ remind_on: options.remindOn, updated_at: now })
    .where(scope)
    .returning({ remind_on: subscriptionCancellationIntentions.remind_on });

  if (updated) {
    return { remindOn: updated.remind_on };
  }

  const [inserted] = await client
    .insert(subscriptionCancellationIntentions)
    .values({
      user_id: options.userId,
      subscription_id: options.subscriptionId,
      remind_on: options.remindOn,
      created_at: now,
      updated_at: now,
    })
    .returning({ remind_on: subscriptionCancellationIntentions.remind_on });

  return { remindOn: inserted.remind_on };
}

/** Explicit clear only — opening Inbox or date passage never calls this. */
export async function clearCancellationIntention(
  client: IntentionClient,
  options: { userId: string; subscriptionId: string },
): Promise<void> {
  await client
    .delete(subscriptionCancellationIntentions)
    .where(
      and(
        eq(subscriptionCancellationIntentions.user_id, options.userId),
        eq(subscriptionCancellationIntentions.subscription_id, options.subscriptionId),
      ),
    );
}
