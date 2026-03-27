ALTER TABLE "team_event" ADD COLUMN "feedback_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "team_event" ADD COLUMN "feedback_deadline" timestamp;