CREATE INDEX "event_interest_status_createdAt_id_idx" ON "event_interest" USING btree ("status","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "event_photo_status_createdAt_id_idx" ON "event_photo" USING btree ("status","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "event_photo_eventId_status_createdAt_id_idx" ON "event_photo" USING btree ("event_id","status","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "event_update_status_createdAt_id_idx" ON "event_update" USING btree ("status","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "event_update_eventId_status_createdAt_id_idx" ON "event_update" USING btree ("event_id","status","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "team_event_active_root_startTime_id_idx" ON "team_event" USING btree ("start_time" DESC NULLS LAST,"id") WHERE cancelled_at IS NULL AND series_id IS NULL;--> statement-breakpoint
CREATE INDEX "team_event_seriesId_id_idx" ON "team_event" USING btree ("series_id","id");--> statement-breakpoint
CREATE INDEX "team_event_member_eventId_id_idx" ON "team_event_member" USING btree ("event_id","id");