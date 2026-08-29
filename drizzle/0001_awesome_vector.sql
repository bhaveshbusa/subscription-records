CREATE TYPE "public"."proposal_kind" AS ENUM('create', 'update', 'charged', 'terms_changed', 'cancel_scheduled', 'cancelled', 'reactivated', 'lapsed');--> statement-breakpoint
CREATE TYPE "public"."proposal_state" AS ENUM('pending', 'accepted', 'rejected', 'superseded');--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"kind" "proposal_kind" NOT NULL,
	"state" "proposal_state" DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"rationale" text,
	"confidence" "confidence",
	"capture_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proposals_user_id_state_created_at_idx" ON "proposals" USING btree ("user_id","state","created_at");