-- Question identity is the holding or draft it is about, not only the provider.
-- Existing rows are backfilled from what they already point at; a draft
-- question written before this migration carried no account, so its scope is
-- the provider alone.

DROP INDEX "capture_questions_user_provider_reason";--> statement-breakpoint
ALTER TABLE "capture_questions" ADD COLUMN "scope_key" text;--> statement-breakpoint
UPDATE "capture_questions"
SET "scope_key" = CASE
  WHEN "subscription_id" IS NULL THEN 'draft:' || "provider_canonical" || '|'
  ELSE 'holding:' || "subscription_id"::text
END;--> statement-breakpoint
ALTER TABLE "capture_questions" ALTER COLUMN "scope_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "capture_questions_user_scope_reason" ON "capture_questions" USING btree ("user_id","scope_key","reason");
