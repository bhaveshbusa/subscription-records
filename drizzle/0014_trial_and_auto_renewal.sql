-- Trial end is the expected payment-start boundary while status is trial.
-- Auto-renewal is yes/no; unknown is null with empty field status.
-- Existing rows keep both facts unknown. Cadence is not copied onto auto-renewal.

CREATE TYPE "public"."auto_renewal" AS ENUM('yes', 'no');--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_ends_on" date;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_renewal" "auto_renewal";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_end_field_status" "field_status" DEFAULT 'empty' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_renewal_field_status" "field_status" DEFAULT 'empty' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_end_confidence" "confidence";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_renewal_confidence" "confidence";
