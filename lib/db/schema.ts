import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const subscriptionStatus = pgEnum("subscription_status", [
  "unknown",
  "trial",
  "active",
  "paused",
  "cancel_scheduled",
  "cancelled",
  "lapsed",
]);

export const fieldStatus = pgEnum("field_status", [
  "empty",
  "proposed",
  "inferred",
  "confirmed",
  "deferred",
  "conflicted",
]);

export const cadence = pgEnum("cadence", ["weekly", "monthly", "yearly"]);

export const confidence = pgEnum("confidence", ["low", "medium", "high"]);

export const eventType = pgEnum("event_type", [
  "started",
  "converted_to_paid",
  "charged",
  "terms_changed",
  "paused",
  "resumed",
  "cancel_scheduled",
  "cancelled",
  "refunded",
  "payment_failed",
  "lapsed",
  "reactivated",
]);

export const proposalKind = pgEnum("proposal_kind", [
  "create",
  "update",
  "charged",
  "terms_changed",
  "cancel_scheduled",
  "cancelled",
  "reactivated",
  "lapsed",
]);

export const captureKind = pgEnum("capture_kind", ["text", "image", "pdf", "audio"]);

export const captureRunState = pgEnum("capture_run_state", [
  "awaiting_upload",
  "reading",
  "read",
  "failed",
]);

export const questionReason = pgEnum("question_reason", [
  "amount",
  "cadence",
  "renewal",
  "duplicate",
  "cancel_timing",
  "account_identity",
  "still_holding",
]);

export const questionState = pgEnum("question_state", ["asked", "answered", "deferred"]);

/**
 * What a reminder is about: terms the user put off answering, or a renewal that
 * is about to come round. Neither is a claim about the ledger.
 */
export const reminderKind = pgEnum("reminder_kind", [
  "deferred_terms",
  "upcoming_renewal",
]);

export const reminderState = pgEnum("reminder_state", ["pending", "dismissed"]);

export const proposalState = pgEnum("proposal_state", [
  "pending",
  "accepted",
  "rejected",
  "superseded",
]);

const timestamps = {
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name"),
    email: text("email").notNull(),
    email_verified: timestamp("email_verified", {
      withTimezone: true,
      mode: "date",
    }),
    image: text("image"),
    ...timestamps,
  },
  (table) => ({
    email_unique: uniqueIndex("users_email_unique").on(table.email),
  }),
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider_canonical: text("provider_canonical").notNull(),
    provider_display: text("provider_display").notNull(),
    plan: text("plan"),
    account_hint: text("account_hint"),
    status: subscriptionStatus("status").notNull(),
    amount_minor: integer("amount_minor"),
    currency: text("currency").notNull().default("GBP"),
    cadence: cadence("cadence"),
    next_renewal: date("next_renewal", { mode: "string" }),
    started_on: date("started_on", { mode: "string" }),
    ends_on: date("ends_on", { mode: "string" }),
    notes: text("notes"),
    provider_field_status: fieldStatus("provider_field_status").notNull(),
    amount_field_status: fieldStatus("amount_field_status").notNull(),
    cadence_field_status: fieldStatus("cadence_field_status").notNull(),
    renewal_field_status: fieldStatus("renewal_field_status").notNull(),
    status_field_status: fieldStatus("status_field_status").notNull(),
    amount_confidence: confidence("amount_confidence"),
    cadence_confidence: confidence("cadence_confidence"),
    renewal_confidence: confidence("renewal_confidence"),
    provider_confidence: confidence("provider_confidence"),
    status_confidence: confidence("status_confidence"),
    deferred_until: timestamp("deferred_until", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => ({
    user_index: index("subscriptions_user_id_idx").on(table.user_id),
    renewal_index: index("subscriptions_user_id_next_renewal_idx").on(
      table.user_id,
      table.next_renewal,
    ),
  }),
);

export const amendments = pgTable(
  "amendments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscription_id: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    effective_from: date("effective_from", { mode: "string" }).notNull(),
    effective_to: date("effective_to", { mode: "string" }),
    amount_minor: integer("amount_minor"),
    currency: text("currency").notNull().default("GBP"),
    cadence: cadence("cadence"),
    plan: text("plan"),
    ...timestamps,
  },
  (table) => ({
    one_open_per_subscription: uniqueIndex(
      "amendments_one_open_per_subscription",
    )
      .on(table.subscription_id)
      .where(sql`${table.effective_to} is null`),
  }),
);

export const captures = pgTable(
  "captures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: captureKind("kind").notNull(),
    source: text("source").notNull(),
    /** The message, for a text capture. A file capture keeps its bytes in the bucket. */
    content: text("content"),
    /** Where the private bucket holds the file, never handed to a browser. */
    storage_key: text("storage_key"),
    media_type: text("media_type"),
    byte_size: integer("byte_size"),
    file_name: text("file_name"),
    ...timestamps,
  },
  (table) => ({
    user_created_index: index("captures_user_id_created_at_idx").on(
      table.user_id,
      table.created_at,
    ),
  }),
);

/**
 * One attempt at reading a file capture, kept so the work survives the request
 * that started it: a browser that closes mid-read leaves a row saying what was
 * uploaded and how far it got, and a retry resumes from it rather than reading
 * the same image twice or losing it.
 */
export const captureRuns = pgTable(
  "capture_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    capture_id: uuid("capture_id")
      .notNull()
      .references(() => captures.id, { onDelete: "cascade" }),
    state: captureRunState("state").notNull().default("awaiting_upload"),
    attempts: integer("attempts").notNull().default(0),
    /** Why the read failed, in words the person who uploaded the file can act on. */
    error: text("error"),
    started_at: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finished_at: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => ({
    capture_unique: uniqueIndex("capture_runs_capture_id").on(table.capture_id),
    user_state_index: index("capture_runs_user_id_state_idx").on(
      table.user_id,
      table.state,
    ),
  }),
);

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscription_id: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "cascade",
    }),
    kind: proposalKind("kind").notNull(),
    state: proposalState("state").notNull().default("pending"),
    payload: jsonb("payload").notNull(),
    rationale: text("rationale"),
    confidence: confidence("confidence"),
    capture_id: uuid("capture_id").references(() => captures.id, {
      onDelete: "set null",
    }),
    decided_at: timestamp("decided_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => ({
    user_state_index: index("proposals_user_id_state_created_at_idx").on(
      table.user_id,
      table.state,
      table.created_at,
    ),
  }),
);

/**
 * A nudge waiting in the inbox. A reminder holds no proposed values and is never
 * applied to anything: dismissing it is the only thing a user can do to it, so a
 * reminder about a renewal date cannot end up confirming that date.
 *
 * `due_on` is the day the reminder is about — the renewal, or the day a deferral
 * came due — and together with `kind` it keeps the scan from raising the same
 * nudge twice, including after the user has dismissed it.
 */
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscription_id: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    kind: reminderKind("kind").notNull(),
    state: reminderState("state").notNull().default("pending"),
    due_on: date("due_on", { mode: "string" }).notNull(),
    /** The nudge itself, in the words the inbox shows. */
    body: text("body").notNull(),
    dismissed_at: timestamp("dismissed_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => ({
    subscription_kind_due_unique: uniqueIndex("reminders_subscription_id_kind_due_on").on(
      table.subscription_id,
      table.kind,
      table.due_on,
    ),
    user_state_index: index("reminders_user_id_state_due_on_idx").on(
      table.user_id,
      table.state,
      table.due_on,
    ),
  }),
);

/**
 * What chat has already asked, so the next turn asks something else. One row per
 * provider and reason: a question that was deferred stays deferred until an
 * answer arrives, which is what keeps "later" from being asked again.
 */
export const captureQuestions = pgTable(
  "capture_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscription_id: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "cascade",
    }),
    capture_id: uuid("capture_id").references(() => captures.id, {
      onDelete: "set null",
    }),
    provider_canonical: text("provider_canonical").notNull(),
    provider_display: text("provider_display").notNull(),
    reason: questionReason("reason").notNull(),
    state: questionState("state").notNull().default("asked"),
    question: text("question").notNull(),
    /** What the message read, so the answer can raise the proposal it settles. */
    candidate: jsonb("candidate"),
    /** Ask order, so a bare "later" answers the newest question even within a tick. */
    asked_seq: bigserial("asked_seq", { mode: "number" }).notNull(),
    resolved_at: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => ({
    user_provider_reason_unique: uniqueIndex("capture_questions_user_provider_reason").on(
      table.user_id,
      table.provider_canonical,
      table.reason,
    ),
    user_state_index: index("capture_questions_user_id_state_idx").on(
      table.user_id,
      table.state,
    ),
  }),
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscription_id: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    type: eventType("type").notNull(),
    at: timestamp("at", { withTimezone: true, mode: "date" }).notNull(),
    confirmed: boolean("confirmed").notNull(),
    rationale: text("rationale"),
    payload: jsonb("payload"),
    capture_id: uuid("capture_id"),
    ...timestamps,
  },
  (table) => ({
    subscription_at_index: index("events_subscription_id_at_idx").on(
      table.subscription_id,
      table.at,
    ),
  }),
);
