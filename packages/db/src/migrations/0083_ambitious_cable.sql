ALTER TYPE "public"."kalakriti_operation_type" ADD VALUE 'attendee_check_in' BEFORE 'breakfast';--> statement-breakpoint
CREATE TABLE "kalakriti_attendee" (
	"id" uuid PRIMARY KEY NOT NULL,
	"edition_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"human_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"archived_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"created_by" text,
	CONSTRAINT "kalakriti_attendee_edition_id_unique" UNIQUE("edition_id","id"),
	CONSTRAINT "kalakriti_attendee_kind_chk" CHECK ("kalakriti_attendee"."kind" IN ('guest', 'judge'))
);
--> statement-breakpoint
CREATE TABLE "kalakriti_judge_assignment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"edition_id" uuid NOT NULL,
	"attendee_id" uuid NOT NULL,
	"competition_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "kalakriti_operation" DROP CONSTRAINT "kalakriti_operation_subject_chk";--> statement-breakpoint
ALTER TABLE "kalakriti_operation" ADD COLUMN "attendee_id" uuid;--> statement-breakpoint
ALTER TABLE "kalakriti_attendee" ADD CONSTRAINT "kalakriti_attendee_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_attendee" ADD CONSTRAINT "kalakriti_attendee_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_judge_assignment" ADD CONSTRAINT "kalakriti_judge_assignment_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_judge_assignment" ADD CONSTRAINT "kalakriti_judge_assignment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_judge_assignment" ADD CONSTRAINT "kalakriti_judge_assignment_attendee_fk" FOREIGN KEY ("edition_id","attendee_id") REFERENCES "public"."kalakriti_attendee"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_judge_assignment" ADD CONSTRAINT "kalakriti_judge_assignment_competition_fk" FOREIGN KEY ("edition_id","competition_id") REFERENCES "public"."kalakriti_competition"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_attendee_humanId_uidx" ON "kalakriti_attendee" USING btree ("human_id");--> statement-breakpoint
CREATE INDEX "kalakriti_attendee_edition_kind_idx" ON "kalakriti_attendee" USING btree ("edition_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_judge_assignment_scope_uidx" ON "kalakriti_judge_assignment" USING btree ("edition_id","attendee_id","competition_id");--> statement-breakpoint
ALTER TABLE "kalakriti_operation" ADD CONSTRAINT "kalakriti_operation_edition_attendee_fk" FOREIGN KEY ("edition_id","attendee_id") REFERENCES "public"."kalakriti_attendee"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kalakriti_operation_attendeeId_idx" ON "kalakriti_operation" USING btree ("attendee_id");--> statement-breakpoint
ALTER TABLE "kalakriti_operation" ADD CONSTRAINT "kalakriti_operation_subject_chk" CHECK (num_nonnulls("kalakriti_operation"."student_id", "kalakriti_operation"."membership_id", "kalakriti_operation"."attendee_id") = 1);