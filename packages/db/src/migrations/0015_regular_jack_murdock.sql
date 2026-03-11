CREATE TYPE "public"."event_interest_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "event_interest" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "event_interest_status" DEFAULT 'pending' NOT NULL,
	"message" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_interest" ADD CONSTRAINT "event_interest_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_interest" ADD CONSTRAINT "event_interest_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_interest" ADD CONSTRAINT "event_interest_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_interest_eventId_userId_uidx" ON "event_interest" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "event_interest_eventId_idx" ON "event_interest" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_interest_userId_idx" ON "event_interest" USING btree ("user_id");