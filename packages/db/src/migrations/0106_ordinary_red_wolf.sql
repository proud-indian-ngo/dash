CREATE TABLE "event_partner" (
	"created_at" timestamp NOT NULL,
	"event_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"instagram" text,
	"linkedin" text,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_post" (
	"buffer_post_id" text NOT NULL,
	"channel" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"event_id" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "social_post_channel_chk" CHECK (channel IN ('instagram', 'linkedin')),
	CONSTRAINT "social_post_kind_chk" CHECK (kind IN ('schedule', 'recap', 'volunteer-call', 'impact', 'story')),
	CONSTRAINT "social_post_status_chk" CHECK (status IN ('queued', 'approved', 'published', 'dropped'))
);
--> statement-breakpoint
CREATE TABLE "social_api_token" (
	"created_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"last_used_at" timestamp,
	"name" text NOT NULL,
	"revoked_at" timestamp,
	"scopes" text[] NOT NULL,
	"token_hash" text NOT NULL,
	CONSTRAINT "social_api_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "event_photo" ADD COLUMN "do_not_use" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_photo" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "event_photo" ADD COLUMN "taken_at" timestamp;--> statement-breakpoint
ALTER TABLE "event_photo" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "team_event" ADD COLUMN "children_attended" integer;--> statement-breakpoint
ALTER TABLE "team_event" ADD COLUMN "social_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "team_event" ADD COLUMN "social_notes" text;--> statement-breakpoint
ALTER TABLE "team_event" ADD COLUMN "volunteers_needed" integer;--> statement-breakpoint
ALTER TABLE "event_partner" ADD CONSTRAINT "event_partner_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_partner_eventId_idx" ON "event_partner" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_post_event_channel_kind_buffer_uidx" ON "social_post" USING btree ("event_id","channel","kind","buffer_post_id");