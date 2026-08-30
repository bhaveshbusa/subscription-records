ALTER TYPE "public"."question_reason" ADD VALUE 'account_identity';--> statement-breakpoint
ALTER TABLE "capture_questions" ADD COLUMN "candidate" jsonb;