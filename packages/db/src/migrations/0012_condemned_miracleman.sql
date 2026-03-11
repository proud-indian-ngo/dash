CREATE TABLE "team_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"location" text,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"is_public" boolean DEFAULT false NOT NULL,
	"whatsapp_group_id" uuid,
	"recurrence_rule" jsonb,
	"parent_event_id" uuid,
	"cancelled_at" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "team_event_whatsapp_group_id_unique" UNIQUE("whatsapp_group_id")
);
--> statement-breakpoint
CREATE TABLE "team_event_member" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"added_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_event" ADD CONSTRAINT "team_event_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_event" ADD CONSTRAINT "team_event_whatsapp_group_id_whatsapp_group_id_fk" FOREIGN KEY ("whatsapp_group_id") REFERENCES "public"."whatsapp_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_event" ADD CONSTRAINT "team_event_parent_event_id_team_event_id_fk" FOREIGN KEY ("parent_event_id") REFERENCES "public"."team_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_event" ADD CONSTRAINT "team_event_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_event_member" ADD CONSTRAINT "team_event_member_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_event_member" ADD CONSTRAINT "team_event_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_event_teamId_idx" ON "team_event" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_event_parentEventId_idx" ON "team_event" USING btree ("parent_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_event_member_eventId_userId_uidx" ON "team_event_member" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "team_event_member_eventId_idx" ON "team_event_member" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "team_event_member_userId_idx" ON "team_event_member" USING btree ("user_id");