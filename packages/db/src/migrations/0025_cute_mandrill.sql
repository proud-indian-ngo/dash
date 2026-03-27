CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent');--> statement-breakpoint
ALTER TABLE "team_event_member" ADD COLUMN "attendance" "attendance_status";--> statement-breakpoint
ALTER TABLE "team_event_member" ADD COLUMN "attendance_marked_at" timestamp;--> statement-breakpoint
ALTER TABLE "team_event_member" ADD COLUMN "attendance_marked_by" text;--> statement-breakpoint
ALTER TABLE "team_event_member" ADD CONSTRAINT "team_event_member_attendance_marked_by_user_id_fk" FOREIGN KEY ("attendance_marked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;