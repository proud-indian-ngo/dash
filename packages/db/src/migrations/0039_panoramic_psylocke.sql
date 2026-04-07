CREATE TYPE "public"."event_update_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "event_update" ADD COLUMN "status" "event_update_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_update" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "event_update" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "event_update" ADD CONSTRAINT "event_update_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_update_eventId_status_idx" ON "event_update" ("event_id","status");--> statement-breakpoint
-- Backfill existing updates as approved to preserve pre-approval behavior
UPDATE "event_update" SET "status" = 'approved';