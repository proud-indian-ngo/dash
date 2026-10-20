ALTER TABLE "social_post" DROP CONSTRAINT "social_post_status_chk";--> statement-breakpoint
ALTER TABLE "social_post" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_status_chk" CHECK (status IN ('queued', 'approved', 'published', 'failed', 'dropped'));