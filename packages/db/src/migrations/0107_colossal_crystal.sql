ALTER TABLE "social_post" ADD COLUMN "event_name" text;--> statement-breakpoint
ALTER TABLE "social_post" ADD COLUMN "occurrence_date" text;--> statement-breakpoint
CREATE INDEX "social_post_occurrence_date_idx" ON "social_post" USING btree ("occurrence_date");