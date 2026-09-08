-- Independent reminder consent. An absent row is unset, distinct from off.
-- Existing subscriptions are left unset: this migration does not insert rows.

CREATE TYPE "public"."reminder_lead_unit" AS ENUM('days', 'months');--> statement-breakpoint
CREATE TYPE "public"."reminder_preference_state" AS ENUM('off', 'enabled');--> statement-breakpoint
CREATE TYPE "public"."reminder_target" AS ENUM('renewal', 'trial_end');--> statement-breakpoint
CREATE TABLE "subscription_reminder_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"target" "reminder_target" NOT NULL,
	"state" "reminder_preference_state" NOT NULL,
	"lead_value" integer,
	"lead_unit" "reminder_lead_unit",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_reminder_preferences" ADD CONSTRAINT "subscription_reminder_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_reminder_preferences" ADD CONSTRAINT "subscription_reminder_preferences_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_reminder_preferences_user_subscription_target" ON "subscription_reminder_preferences" USING btree ("user_id","subscription_id","target");--> statement-breakpoint
CREATE INDEX "subscription_reminder_preferences_user_id_idx" ON "subscription_reminder_preferences" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "subscription_reminder_preferences" ADD CONSTRAINT "subscription_reminder_preferences_lead_matches_state" CHECK (
  ("state" = 'off' AND "lead_value" IS NULL AND "lead_unit" IS NULL)
  OR
  ("state" = 'enabled' AND "lead_value" IS NOT NULL AND "lead_value" > 0 AND "lead_unit" IS NOT NULL)
);
