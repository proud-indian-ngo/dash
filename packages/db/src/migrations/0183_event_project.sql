ALTER TABLE "team_event" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "team_event" ADD CONSTRAINT "team_event_project_programme_fk" FOREIGN KEY ("project_id","programme_id") REFERENCES "public"."project"("id","programme_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_event_projectId_idx" ON "team_event" USING btree ("project_id");