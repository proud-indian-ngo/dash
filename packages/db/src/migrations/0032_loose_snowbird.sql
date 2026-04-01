ALTER TABLE "team_event" DROP CONSTRAINT "team_event_parent_event_id_team_event_id_fk";
--> statement-breakpoint
DROP INDEX "team_event_parentEventId_idx";--> statement-breakpoint
DROP INDEX "team_event_parent_start_uidx";--> statement-breakpoint
ALTER TABLE "team_event" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "team_event" ADD COLUMN "original_date" date;--> statement-breakpoint
ALTER TABLE "team_event" ADD CONSTRAINT "team_event_series_id_team_event_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."team_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_event_seriesId_idx" ON "team_event" USING btree ("series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_event_series_originalDate_uidx" ON "team_event" USING btree ("series_id","original_date");--> statement-breakpoint
ALTER TABLE "team_event" DROP COLUMN "copy_all_members";--> statement-breakpoint
ALTER TABLE "team_event" DROP COLUMN "parent_event_id";