CREATE TYPE "public"."capture_run_state" AS ENUM('awaiting_upload', 'reading', 'read', 'failed');--> statement-breakpoint
ALTER TYPE "public"."capture_kind" ADD VALUE 'image';--> statement-breakpoint
CREATE TABLE "capture_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"capture_id" uuid NOT NULL,
	"state" "capture_run_state" DEFAULT 'awaiting_upload' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "captures" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "media_type" text;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "byte_size" integer;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "capture_runs" ADD CONSTRAINT "capture_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_runs" ADD CONSTRAINT "capture_runs_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "capture_runs_capture_id" ON "capture_runs" USING btree ("capture_id");--> statement-breakpoint
CREATE INDEX "capture_runs_user_id_state_idx" ON "capture_runs" USING btree ("user_id","state");