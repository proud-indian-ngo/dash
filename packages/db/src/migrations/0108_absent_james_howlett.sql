CREATE TABLE "social_run" (
	"created_at" timestamp NOT NULL,
	"digest_sent" boolean NOT NULL,
	"dropped" integer NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"events_seen" integer NOT NULL,
	"finished_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"planned" integer NOT NULL,
	"recorded" integer NOT NULL,
	"rendered" integer NOT NULL,
	"skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp NOT NULL,
	"tick" text NOT NULL,
	CONSTRAINT "social_run_tick_chk" CHECK (tick IN ('hourly', 'digest'))
);
--> statement-breakpoint
ALTER TABLE "social_post" ADD COLUMN "dropped_at" timestamp;--> statement-breakpoint
ALTER TABLE "social_post" ADD COLUMN "dropped_by" text;--> statement-breakpoint
CREATE INDEX "social_run_started_at_idx" ON "social_run" USING btree ("started_at" DESC NULLS LAST,"id");--> statement-breakpoint
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_dropped_by_user_id_fk" FOREIGN KEY ("dropped_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_post_scheduled_for_idx" ON "social_post" USING btree ("scheduled_for" DESC NULLS LAST,"id");