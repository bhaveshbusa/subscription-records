import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { subscriptionReminderPreferences } from "@/lib/db/schema";
import type { Cadence } from "@/lib/subscriptions/params";

import {
  previewReminder,
  REMINDER_LEAD_UNITS,
  suggestedPreference,
  type ReminderConsent,
  type ReminderLeadUnit,
  type ReminderPreview,
  type ReminderTarget,
  type SuggestedPreference,
} from "./dates";

export type {
  ReminderConsent,
  ReminderLeadUnit,
  ReminderPreview,
  ReminderTarget,
  SuggestedPreference,
} from "./dates";

export type PreferenceClient = Pick<NodePgDatabase, "select" | "insert" | "update" | "delete">;

export type ReminderPreferenceInput =
  | { state: "unset" }
  | { state: "off" }
  | { state: "enabled"; leadValue: number; leadUnit: ReminderLeadUnit };

export type ReminderPreferencesInput = {
  renewal?: ReminderPreferenceInput;
  trialEnd?: ReminderPreferenceInput;
};

export type ReminderPreferenceView = {
  state: ReminderConsent;
  leadValue: number | null;
  leadUnit: ReminderLeadUnit | null;
  suggestion: SuggestedPreference;
  preview: ReminderPreview;
};

export type ReminderPreferencesView = {
  renewal: ReminderPreferenceView;
  trialEnd: ReminderPreferenceView;
};

export function emptyReminderPreferencesView(options: {
  cadence: Cadence | null;
  nextRenewal?: string | null;
  trialEndsOn?: string | null;
  today?: string;
}): ReminderPreferencesView {
  return toReminderPreferencesView({
    cadence: options.cadence,
    nextRenewal: options.nextRenewal ?? null,
    trialEndsOn: options.trialEndsOn ?? null,
    rows: [],
    today: options.today ?? "2026-09-08",
  });
}

const enabledPreferenceSchema = z
  .object({
    state: z.literal("enabled"),
    leadValue: z.number().int().min(1).max(365),
    leadUnit: z.enum(REMINDER_LEAD_UNITS),
  })
  .strict();

/** Capture can enable or turn off a reminder; it cannot unset one. */
const offPreferenceSchema = z
  .object({
    state: z.literal("off"),
    leadValue: z.unknown().optional(),
    leadUnit: z.unknown().optional(),
  })
  .transform(() => ({ state: "off" as const }));

export const proposedReminderPreferenceSchema = z.union([
  offPreferenceSchema,
  enabledPreferenceSchema,
]);

export const reminderPreferenceInputSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unset") }).strict(),
  z.object({ state: z.literal("off") }).strict(),
  enabledPreferenceSchema,
]);

export const proposedReminderPreferencesSchema = z
  .object({
    renewal: proposedReminderPreferenceSchema.optional(),
    trialEnd: proposedReminderPreferenceSchema.optional(),
  })
  .strict()
  .refine((value) => value.renewal !== undefined || value.trialEnd !== undefined, {
    message: "a reminder preference proposal needs a renewal or trial-end choice",
  });

export type ProposedReminderPreferences = z.infer<typeof proposedReminderPreferencesSchema>;

export const reminderPreferencesInputSchema = z
  .object({
    renewal: reminderPreferenceInputSchema.optional(),
    trialEnd: reminderPreferenceInputSchema.optional(),
  })
  .strict()
  .refine((value) => value.renewal !== undefined || value.trialEnd !== undefined, {
    message: "a reminder preference update needs a renewal or trial-end choice",
  });

export type StoredReminderPreference = {
  target: ReminderTarget;
  state: "off" | "enabled";
  leadValue: number | null;
  leadUnit: ReminderLeadUnit | null;
};

function emptyView(
  target: ReminderTarget,
  cadence: Cadence | null,
  dueDate: string | null,
  today: string,
): ReminderPreferenceView {
  const suggestion = suggestedPreference(target, cadence);

  return {
    state: "unset",
    leadValue: null,
    leadUnit: null,
    suggestion,
    preview: previewReminder({
      dueDate,
      state: "unset",
      leadValue: null,
      leadUnit: null,
      today,
    }),
  };
}

export function toReminderPreferencesView(options: {
  cadence: Cadence | null;
  nextRenewal: string | null;
  trialEndsOn: string | null;
  rows: StoredReminderPreference[];
  today: string;
}): ReminderPreferencesView {
  const byTarget = new Map(options.rows.map((row) => [row.target, row]));

  function viewFor(target: ReminderTarget, dueDate: string | null): ReminderPreferenceView {
    const stored = byTarget.get(target);
    const suggestion = suggestedPreference(target, options.cadence);

    if (!stored) {
      return emptyView(target, options.cadence, dueDate, options.today);
    }

    const state: ReminderConsent = stored.state;
    const leadValue = stored.state === "enabled" ? stored.leadValue : null;
    const leadUnit = stored.state === "enabled" ? stored.leadUnit : null;

    return {
      state,
      leadValue,
      leadUnit,
      suggestion,
      preview: previewReminder({
        dueDate,
        state,
        leadValue,
        leadUnit,
        today: options.today,
      }),
    };
  }

  return {
    renewal: viewFor("renewal", options.nextRenewal),
    trialEnd: viewFor("trial_end", options.trialEndsOn),
  };
}

export async function listReminderPreferences(
  client: Pick<NodePgDatabase, "select">,
  options: { userId: string; subscriptionId: string },
): Promise<StoredReminderPreference[]> {
  const rows = await client
    .select({
      target: subscriptionReminderPreferences.target,
      state: subscriptionReminderPreferences.state,
      leadValue: subscriptionReminderPreferences.lead_value,
      leadUnit: subscriptionReminderPreferences.lead_unit,
    })
    .from(subscriptionReminderPreferences)
    .where(
      and(
        eq(subscriptionReminderPreferences.user_id, options.userId),
        eq(subscriptionReminderPreferences.subscription_id, options.subscriptionId),
      ),
    );

  return rows;
}

export async function saveReminderPreferences(
  client: PreferenceClient,
  options: {
    userId: string;
    subscriptionId: string;
    input: ReminderPreferencesInput;
    now?: Date;
  },
): Promise<void> {
  const now = options.now ?? new Date();
  const writes: { target: ReminderTarget; input: ReminderPreferenceInput }[] = [];

  if (options.input.renewal) {
    writes.push({ target: "renewal", input: options.input.renewal });
  }

  if (options.input.trialEnd) {
    writes.push({ target: "trial_end", input: options.input.trialEnd });
  }

  for (const write of writes) {
    await saveOnePreference(client, {
      userId: options.userId,
      subscriptionId: options.subscriptionId,
      target: write.target,
      input: write.input,
      now,
    });
  }
}

async function saveOnePreference(
  client: PreferenceClient,
  options: {
    userId: string;
    subscriptionId: string;
    target: ReminderTarget;
    input: ReminderPreferenceInput;
    now: Date;
  },
): Promise<void> {
  const scope = and(
    eq(subscriptionReminderPreferences.user_id, options.userId),
    eq(subscriptionReminderPreferences.subscription_id, options.subscriptionId),
    eq(subscriptionReminderPreferences.target, options.target),
  );

  if (options.input.state === "unset") {
    await client.delete(subscriptionReminderPreferences).where(scope);
    return;
  }

  const leadValue = options.input.state === "enabled" ? options.input.leadValue : null;
  const leadUnit = options.input.state === "enabled" ? options.input.leadUnit : null;
  const values = {
    user_id: options.userId,
    subscription_id: options.subscriptionId,
    target: options.target,
    state: options.input.state,
    lead_value: leadValue,
    lead_unit: leadUnit,
    updated_at: options.now,
  };

  const updated = await client
    .update(subscriptionReminderPreferences)
    .set({
      state: values.state,
      lead_value: values.lead_value,
      lead_unit: values.lead_unit,
      updated_at: options.now,
    })
    .where(scope)
    .returning({ id: subscriptionReminderPreferences.id });

  if (updated.length === 0) {
    await client.insert(subscriptionReminderPreferences).values(values);
  }
}
