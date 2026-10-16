CREATE TYPE "private"."whatsapp_message_status" AS ENUM('sending', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TABLE "private"."whatsapp_message" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"error" text,
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"status" "private"."whatsapp_message_status" DEFAULT 'sending' NOT NULL,
	"template" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text,
	"wamid" text
);
--> statement-breakpoint
ALTER TABLE "private"."held_notification" ADD COLUMN "whatsapp_template" jsonb;--> statement-breakpoint
ALTER TABLE "private"."whatsapp_message" ADD CONSTRAINT "whatsapp_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_message_wamid_idx" ON "private"."whatsapp_message" USING btree ("wamid");--> statement-breakpoint
CREATE INDEX "whatsapp_message_created_at_idx" ON "private"."whatsapp_message" USING btree ("created_at");