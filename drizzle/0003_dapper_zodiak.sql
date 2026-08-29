CREATE TYPE "public"."question_reason" AS ENUM('amount', 'cadence', 'renewal', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."question_state" AS ENUM('asked', 'answered', 'deferred');--> statement-breakpoint
CREATE TABLE "capture_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"capture_id" uuid,
	"provider_canonical" text NOT NULL,
	"provider_display" text NOT NULL,
	"reason" "question_reason" NOT NULL,
	"state" "question_state" DEFAULT 'asked' NOT NULL,
	"question" text NOT NULL,
	"asked_seq" bigserial NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "capture_questions" ADD CONSTRAINT "capture_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_questions" ADD CONSTRAINT "capture_questions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_questions" ADD CONSTRAINT "capture_questions_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "capture_questions_user_provider_reason" ON "capture_questions" USING btree ("user_id","provider_canonical","reason");--> statement-breakpoint
CREATE INDEX "capture_questions_user_id_state_idx" ON "capture_questions" USING btree ("user_id","state");