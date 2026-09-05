CREATE TYPE "public"."kalakriti_operation_type" AS ENUM('pickup', 'venue_departure', 'drop_off', 'volunteer_check_in', 'breakfast', 'lunch', 'competition_attendance');--> statement-breakpoint
CREATE TABLE "kalakriti_operation" (
	"competition_session_id" uuid,
	"correction_reason" text,
	"created_at" timestamp NOT NULL,
	"edition_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"membership_id" uuid,
	"occurred_at" timestamp NOT NULL,
	"operation_id" uuid NOT NULL,
	"recorded_by" text NOT NULL,
	"student_id" uuid,
	"superseded_by_operation_id" uuid,
	"type" "kalakriti_operation_type" NOT NULL,
	CONSTRAINT "kalakriti_operation_subject_chk" CHECK ((
        "kalakriti_operation"."student_id" IS NOT NULL AND "kalakriti_operation"."membership_id" IS NULL
      ) OR (
        "kalakriti_operation"."student_id" IS NULL AND "kalakriti_operation"."membership_id" IS NOT NULL
      )),
	CONSTRAINT "kalakriti_operation_session_chk" CHECK ((
        "kalakriti_operation"."type"::text = 'competition_attendance'
      ) OR (
        "kalakriti_operation"."competition_session_id" IS NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "kalakriti_operation" ADD CONSTRAINT "kalakriti_operation_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_operation" ADD CONSTRAINT "kalakriti_operation_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_operation" ADD CONSTRAINT "kalakriti_operation_edition_student_fk" FOREIGN KEY ("edition_id","student_id") REFERENCES "public"."kalakriti_student"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_operation" ADD CONSTRAINT "kalakriti_operation_edition_membership_fk" FOREIGN KEY ("edition_id","membership_id") REFERENCES "public"."kalakriti_edition_membership"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_operation" ADD CONSTRAINT "kalakriti_operation_edition_session_fk" FOREIGN KEY ("edition_id","competition_session_id") REFERENCES "public"."kalakriti_competition_session"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_operation" ADD CONSTRAINT "kalakriti_operation_superseded_fk" FOREIGN KEY ("superseded_by_operation_id") REFERENCES "public"."kalakriti_operation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_operation_operationId_uidx" ON "kalakriti_operation" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "kalakriti_operation_editionId_idx" ON "kalakriti_operation" USING btree ("edition_id");--> statement-breakpoint
CREATE INDEX "kalakriti_operation_studentId_idx" ON "kalakriti_operation" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "kalakriti_operation_membershipId_idx" ON "kalakriti_operation" USING btree ("membership_id");