CREATE TYPE "public"."event_type" AS ENUM('event', 'class');--> statement-breakpoint
CREATE TABLE "center" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" "reimbursement_city" DEFAULT 'bangalore' NOT NULL,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "center_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "center_coordinator" (
	"id" uuid PRIMARY KEY NOT NULL,
	"center_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"assigned_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_event_student" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attendance" "attendance_status",
	"attendance_marked_at" timestamp,
	"attendance_marked_by" text
);
--> statement-breakpoint
CREATE TABLE "student" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"date_of_birth" date,
	"gender" "user_gender",
	"center_id" uuid,
	"city" "reimbursement_city" DEFAULT 'bangalore' NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_event" ADD COLUMN "type" "event_type" DEFAULT 'event' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_event" ADD COLUMN "center_id" uuid;--> statement-breakpoint
ALTER TABLE "center_coordinator" ADD CONSTRAINT "center_coordinator_center_id_center_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."center"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "center_coordinator" ADD CONSTRAINT "center_coordinator_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_event_student" ADD CONSTRAINT "class_event_student_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_event_student" ADD CONSTRAINT "class_event_student_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_event_student" ADD CONSTRAINT "class_event_student_attendance_marked_by_user_id_fk" FOREIGN KEY ("attendance_marked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_center_id_center_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."center"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "center_coordinator_centerId_userId_uidx" ON "center_coordinator" USING btree ("center_id","user_id");--> statement-breakpoint
CREATE INDEX "center_coordinator_centerId_idx" ON "center_coordinator" USING btree ("center_id");--> statement-breakpoint
CREATE INDEX "center_coordinator_userId_idx" ON "center_coordinator" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_event_student_eventId_studentId_uidx" ON "class_event_student" USING btree ("event_id","student_id");--> statement-breakpoint
CREATE INDEX "class_event_student_eventId_idx" ON "class_event_student" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "class_event_student_studentId_idx" ON "class_event_student" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_centerId_idx" ON "student" USING btree ("center_id");--> statement-breakpoint
CREATE INDEX "student_city_idx" ON "student" USING btree ("city");--> statement-breakpoint
ALTER TABLE "team_event" ADD CONSTRAINT "team_event_center_id_center_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."center"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_event_centerId_idx" ON "team_event" USING btree ("center_id");