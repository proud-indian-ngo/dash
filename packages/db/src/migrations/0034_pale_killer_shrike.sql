CREATE TYPE "public"."scheduled_message_recipient_status" AS ENUM('pending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scheduled_message_recipient_type" AS ENUM('group', 'user');--> statement-breakpoint
CREATE TABLE "scheduled_message_recipient" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scheduled_message_id" uuid NOT NULL,
	"recipient_id" text NOT NULL,
	"label" text NOT NULL,
	"type" "scheduled_message_recipient_type" NOT NULL,
	"status" "scheduled_message_recipient_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"sent_at" timestamp,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_message_recipient" ADD CONSTRAINT "scheduled_message_recipient_scheduled_message_id_scheduled_message_id_fk" FOREIGN KEY ("scheduled_message_id") REFERENCES "public"."scheduled_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_message_recipient_scheduledMessageId_idx" ON "scheduled_message_recipient" USING btree ("scheduled_message_id");--> statement-breakpoint
INSERT INTO "scheduled_message_recipient" ("id", "scheduled_message_id", "recipient_id", "label", "type", "status", "error", "sent_at", "retry_count", "created_at", "updated_at")
SELECT
	gen_random_uuid(),
	sm."id",
	(r->>'id')::text,
	(r->>'label')::text,
	(r->>'type')::scheduled_message_recipient_type,
	sm."status"::text::scheduled_message_recipient_status,
	NULL,
	CASE WHEN sm."status" = 'sent' THEN sm."updated_at" ELSE NULL END,
	0,
	sm."created_at",
	sm."updated_at"
FROM "scheduled_message" sm, jsonb_array_elements(sm."recipients") AS r
WHERE sm."recipients" IS NOT NULL AND jsonb_typeof(sm."recipients") = 'array';--> statement-breakpoint
ALTER TABLE "scheduled_message" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "scheduled_message" DROP COLUMN "recipients";--> statement-breakpoint
DROP TYPE "public"."scheduled_message_status";