CREATE TABLE "event_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_feedback_submission" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"feedback_id" uuid NOT NULL,
	"submitted_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_feedback" ADD CONSTRAINT "event_feedback_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_feedback_submission" ADD CONSTRAINT "event_feedback_submission_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_feedback_submission" ADD CONSTRAINT "event_feedback_submission_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_feedback_submission" ADD CONSTRAINT "event_feedback_submission_feedback_id_event_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."event_feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_feedback_eventId_idx" ON "event_feedback" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_feedback_sub_eventId_userId_uidx" ON "event_feedback_submission" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "event_feedback_sub_eventId_idx" ON "event_feedback_submission" USING btree ("event_id");