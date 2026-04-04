CREATE TABLE "event_reminder_sent" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"instance_date" text,
	"interval_minutes" integer NOT NULL,
	"sent_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_event" ADD COLUMN "reminder_intervals" jsonb;--> statement-breakpoint
ALTER TABLE "event_reminder_sent" ADD CONSTRAINT "event_reminder_sent_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_reminder_sent_uidx" ON "event_reminder_sent" USING btree ("event_id", COALESCE("instance_date", '__none__'), "interval_minutes");--> statement-breakpoint
CREATE INDEX "event_reminder_sent_eventId_idx" ON "event_reminder_sent" USING btree ("event_id");