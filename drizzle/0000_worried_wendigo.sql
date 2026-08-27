CREATE TYPE "public"."cadence" AS ENUM('weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('started', 'converted_to_paid', 'charged', 'terms_changed', 'paused', 'resumed', 'cancel_scheduled', 'cancelled', 'refunded', 'payment_failed', 'lapsed', 'reactivated');--> statement-breakpoint
CREATE TYPE "public"."field_status" AS ENUM('empty', 'proposed', 'inferred', 'confirmed', 'deferred', 'conflicted');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('unknown', 'trial', 'active', 'paused', 'cancel_scheduled', 'cancelled', 'lapsed');--> statement-breakpoint
CREATE TABLE "amendments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"amount_minor" integer,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"cadence" "cadence",
	"plan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"covers_from" date,
	"covers_to" date,
	"capture_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"type" "event_type" NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"confirmed" boolean NOT NULL,
	"rationale" text,
	"payload" jsonb,
	"capture_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_canonical" text NOT NULL,
	"provider_display" text NOT NULL,
	"plan" text,
	"account_hint" text,
	"status" "subscription_status" NOT NULL,
	"amount_minor" integer,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"cadence" "cadence",
	"next_renewal" date,
	"started_on" date,
	"ends_on" date,
	"notes" text,
	"provider_field_status" "field_status" NOT NULL,
	"amount_field_status" "field_status" NOT NULL,
	"cadence_field_status" "field_status" NOT NULL,
	"renewal_field_status" "field_status" NOT NULL,
	"status_field_status" "field_status" NOT NULL,
	"amount_confidence" "confidence",
	"cadence_confidence" "confidence",
	"renewal_confidence" "confidence",
	"provider_confidence" "confidence",
	"status_confidence" "confidence",
	"deferred_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "amendments" ADD CONSTRAINT "amendments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amendments" ADD CONSTRAINT "amendments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "amendments_one_open_per_subscription" ON "amendments" USING btree ("subscription_id") WHERE "amendments"."effective_to" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "charges_user_id_idempotency_key" ON "charges" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "events_subscription_id_at_idx" ON "events" USING btree ("subscription_id","at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_next_renewal_idx" ON "subscriptions" USING btree ("user_id","next_renewal");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");