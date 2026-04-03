CREATE TYPE "public"."scheduled_message_status" AS ENUM('pending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "scheduled_message" (
	"id" uuid PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"status" "scheduled_message_status" DEFAULT 'pending' NOT NULL,
	"recipients" jsonb NOT NULL,
	"attachments" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_message" ADD CONSTRAINT "scheduled_message_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;