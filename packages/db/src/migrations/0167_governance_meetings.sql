CREATE TYPE "public"."agenda_item_kind" AS ENUM('resolution', 'discussion', 'note_circulars');--> statement-breakpoint
CREATE TYPE "public"."agenda_outcome" AS ENUM('passed', 'failed', 'no_decision');--> statement-breakpoint
CREATE TYPE "public"."meeting_mode" AS ENUM('in_person', 'video', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('draft', 'convened', 'held', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."meeting_presence" AS ENUM('in_person', 'video', 'absent_with_leave', 'absent');--> statement-breakpoint
CREATE TYPE "public"."vote_choice" AS ENUM('for', 'against', 'abstain');--> statement-breakpoint
CREATE TABLE "agenda_item" (
	"casting_vote" "vote_choice",
	"created_at" timestamp NOT NULL,
	"decided_at" timestamp,
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "agenda_item_kind" NOT NULL,
	"meeting_id" uuid NOT NULL,
	"noted_resolution_ids" jsonb,
	"notes" text,
	"outcome" "agenda_outcome",
	"outcome_note" text,
	"position" integer NOT NULL,
	"resolution_id" uuid,
	"title" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_vote" (
	"absentee_written" boolean DEFAULT false NOT NULL,
	"agenda_item_id" uuid NOT NULL,
	"choice" "vote_choice" NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"recorded_by" text,
	"trustee_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting" (
	"cancelled_reason" text,
	"chair_trustee_id" uuid,
	"created_at" timestamp NOT NULL,
	"created_by" text,
	"deed_version_id" uuid,
	"held_at" timestamp,
	"id" uuid PRIMARY KEY NOT NULL,
	"minutes_document_id" uuid,
	"minutes_object_key" text,
	"minutes_sha256" text,
	"mode" "meeting_mode" DEFAULT 'hybrid' NOT NULL,
	"notes" text,
	"notice_sent_at" timestamp,
	"notice_sent_by" text,
	"place" text,
	"starts_at" timestamp NOT NULL,
	"status" "meeting_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_attendance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"marked_at" timestamp,
	"marked_by" text,
	"meeting_id" uuid NOT NULL,
	"offices" jsonb NOT NULL,
	"presence" "meeting_presence" DEFAULT 'absent' NOT NULL,
	"trustee_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_resolution_id_resolution_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_vote" ADD CONSTRAINT "agenda_vote_agenda_item_id_agenda_item_id_fk" FOREIGN KEY ("agenda_item_id") REFERENCES "public"."agenda_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_vote" ADD CONSTRAINT "agenda_vote_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_vote" ADD CONSTRAINT "agenda_vote_trustee_id_trustee_id_fk" FOREIGN KEY ("trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_chair_trustee_id_trustee_id_fk" FOREIGN KEY ("chair_trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_deed_version_id_deed_version_id_fk" FOREIGN KEY ("deed_version_id") REFERENCES "public"."deed_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_minutes_document_id_governance_document_id_fk" FOREIGN KEY ("minutes_document_id") REFERENCES "public"."governance_document"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_notice_sent_by_user_id_fk" FOREIGN KEY ("notice_sent_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_marked_by_user_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_trustee_id_trustee_id_fk" FOREIGN KEY ("trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_item_meeting_idx" ON "agenda_item" USING btree ("meeting_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_vote_uidx" ON "agenda_vote" USING btree ("agenda_item_id","trustee_id");--> statement-breakpoint
CREATE INDEX "meeting_starts_idx" ON "meeting" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_attendance_uidx" ON "meeting_attendance" USING btree ("meeting_id","trustee_id");