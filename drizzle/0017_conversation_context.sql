-- A capture turn remembers the explicit target it was sent against (one of a
-- subscription, a pending proposal, or an open question; none means all
-- subscriptions) and the browser's id for the send attempt, so a conversation
-- about one record can be read back after reload and a transport retry replays
-- the stored turn instead of reading it twice. Existing rows stay untargeted.

ALTER TABLE "captures" ADD COLUMN "subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "proposal_id" uuid;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "question_id" uuid;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "client_turn_id" uuid;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_question_id_capture_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."capture_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "captures_user_id_subscription_id_idx" ON "captures" USING btree ("user_id","subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "captures_user_client_turn" ON "captures" USING btree ("user_id","client_turn_id");