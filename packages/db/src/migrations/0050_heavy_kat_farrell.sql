CREATE TYPE "public"."kalakriti_edition_lifecycle" AS ENUM('draft', 'registration_open', 'registration_locked', 'live', 'archived');--> statement-breakpoint
CREATE TYPE "public"."kalakriti_membership_kind" AS ENUM('volunteer', 'guardian');--> statement-breakpoint
CREATE TYPE "public"."kalakriti_membership_state" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."kalakriti_responsibility" AS ENUM('edition_admin', 'overall_events_lead');--> statement-breakpoint
CREATE TABLE "kalakriti_assignment" (
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"membership_id" uuid NOT NULL,
	"responsibility" "kalakriti_responsibility" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kalakriti_audit_entry" (
	"action" text NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp NOT NULL,
	"domain" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"metadata" jsonb,
	"reason" text,
	"target_id" text,
	"target_type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kalakriti_edition" (
	"age_cutoff_date" date NOT NULL,
	"branding_key" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"event_date" date NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"lifecycle" "kalakriti_edition_lifecycle" DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"planned_registration_close_at" timestamp with time zone NOT NULL,
	"runner_up_points" integer DEFAULT 5 NOT NULL,
	"team_event_id" uuid NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"updated_at" timestamp NOT NULL,
	"winner_points" integer DEFAULT 10 NOT NULL,
	"year" integer NOT NULL,
	CONSTRAINT "kalakriti_edition_year_chk" CHECK ("kalakriti_edition"."year" BETWEEN 2000 AND 2200),
	CONSTRAINT "kalakriti_edition_points_chk" CHECK ("kalakriti_edition"."winner_points" >= 0 AND "kalakriti_edition"."runner_up_points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "kalakriti_edition_membership" (
	"archived_at" timestamp,
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "kalakriti_membership_kind" NOT NULL,
	"snapshot_email" text,
	"snapshot_name" text NOT NULL,
	"snapshot_phone" text,
	"state" "kalakriti_membership_state" DEFAULT 'active' NOT NULL,
	"updated_at" timestamp NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kalakriti_external_identity" (
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ADD CONSTRAINT "kalakriti_assignment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ADD CONSTRAINT "kalakriti_assignment_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ADD CONSTRAINT "kalakriti_assignment_membership_id_kalakriti_edition_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."kalakriti_edition_membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_audit_entry" ADD CONSTRAINT "kalakriti_audit_entry_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_audit_entry" ADD CONSTRAINT "kalakriti_audit_entry_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_edition" ADD CONSTRAINT "kalakriti_edition_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_edition" ADD CONSTRAINT "kalakriti_edition_team_event_id_team_event_id_fk" FOREIGN KEY ("team_event_id") REFERENCES "public"."team_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_edition_membership" ADD CONSTRAINT "kalakriti_edition_membership_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_edition_membership" ADD CONSTRAINT "kalakriti_edition_membership_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_edition_membership" ADD CONSTRAINT "kalakriti_edition_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_external_identity" ADD CONSTRAINT "kalakriti_external_identity_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_external_identity" ADD CONSTRAINT "kalakriti_external_identity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_assignment_membership_responsibility_uidx" ON "kalakriti_assignment" USING btree ("membership_id","responsibility");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_assignment_overall_events_lead_uidx" ON "kalakriti_assignment" USING btree ("edition_id") WHERE "kalakriti_assignment"."responsibility" = 'overall_events_lead';--> statement-breakpoint
CREATE INDEX "kalakriti_assignment_editionId_idx" ON "kalakriti_assignment" USING btree ("edition_id");--> statement-breakpoint
CREATE INDEX "kalakriti_audit_editionId_createdAt_idx" ON "kalakriti_audit_entry" USING btree ("edition_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_edition_year_uidx" ON "kalakriti_edition" USING btree ("year");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_edition_teamEventId_uidx" ON "kalakriti_edition" USING btree ("team_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_membership_editionId_userId_uidx" ON "kalakriti_edition_membership" USING btree ("edition_id","user_id");--> statement-breakpoint
CREATE INDEX "kalakriti_membership_userId_idx" ON "kalakriti_edition_membership" USING btree ("user_id");