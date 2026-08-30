CREATE TYPE "public"."reminder_kind" AS ENUM('deferred_terms', 'upcoming_renewal');--> statement-breakpoint
CREATE TYPE "public"."reminder_state" AS ENUM('pending', 'dismissed');--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"kind" "reminder_kind" NOT NULL,
	"state" "reminder_state" DEFAULT 'pending' NOT NULL,
	"due_on" date NOT NULL,
	"body" text NOT NULL,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_subscription_id_kind_due_on" ON "reminders" USING btree ("subscription_id","kind","due_on");--> statement-breakpoint
CREATE INDEX "reminders_user_id_state_due_on_idx" ON "reminders" USING btree ("user_id","state","due_on");