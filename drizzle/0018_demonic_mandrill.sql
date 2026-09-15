ALTER TYPE "public"."question_reason" ADD VALUE 'cancel_intention' BEFORE 'account_identity';--> statement-breakpoint
CREATE TABLE "subscription_cancellation_intentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"remind_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_cancellation_intentions" ADD CONSTRAINT "subscription_cancellation_intentions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_cancellation_intentions" ADD CONSTRAINT "subscription_cancellation_intentions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_cancellation_intentions_subscription_unique" ON "subscription_cancellation_intentions" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_cancellation_intentions_user_id_idx" ON "subscription_cancellation_intentions" USING btree ("user_id");