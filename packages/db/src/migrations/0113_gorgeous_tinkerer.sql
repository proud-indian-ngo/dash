ALTER TABLE "team" ADD COLUMN "programme_id" uuid;--> statement-breakpoint
ALTER TABLE "team_event" ADD COLUMN "programme_id" uuid DEFAULT '01930000-0000-7000-8000-000000000009' NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_programme_id_programme_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programme"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_event" ADD CONSTRAINT "team_event_programme_id_programme_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programme"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_event_programmeId_idx" ON "team_event" USING btree ("programme_id");