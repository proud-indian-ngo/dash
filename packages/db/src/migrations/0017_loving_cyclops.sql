CREATE TYPE "public"."event_photo_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "event_immich_album" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"immich_album_id" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_photo" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"immich_asset_id" text,
	"caption" text,
	"status" "event_photo_status" DEFAULT 'pending' NOT NULL,
	"uploaded_by" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_update" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_immich_album" ADD CONSTRAINT "event_immich_album_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photo" ADD CONSTRAINT "event_photo_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photo" ADD CONSTRAINT "event_photo_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photo" ADD CONSTRAINT "event_photo_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_update" ADD CONSTRAINT "event_update_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_update" ADD CONSTRAINT "event_update_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_immich_album_eventId_uidx" ON "event_immich_album" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_photo_eventId_idx" ON "event_photo" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_photo_uploadedBy_idx" ON "event_photo" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "event_update_eventId_idx" ON "event_update" USING btree ("event_id");