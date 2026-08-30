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

export const captureKind = pgEnum("capture_kind", ["text"]);

export const questionReason = pgEnum("question_reason", [
  "amount",
  "cadence",
  "renewal",
  "duplicate",
  "cancel_timing",
]);

export const questionState = pgEnum("question_state", ["asked", "answered", "deferred"]);

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

export const charges = pgTable(
  "charges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscription_id: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    paid_on: date("paid_on", { mode: "string" }).notNull(),
    amount_minor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("GBP"),
    covers_from: date("covers_from", { mode: "string" }),
    covers_to: date("covers_to", { mode: "string" }),
    capture_id: uuid("capture_id"),
    idempotency_key: text("idempotency_key").notNull(),
    ...timestamps,
  },
  (table) => ({
    user_idempotency_unique: uniqueIndex("charges_user_id_idempotency_key").on(
      table.user_id,
      table.idempotency_key,
    ),
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
    content: text("content").notNull(),
    ...timestamps,
  },
  (table) => ({
    user_created_index: index("captures_user_id_created_at_idx").on(
      table.user_id,
      table.created_at,
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
