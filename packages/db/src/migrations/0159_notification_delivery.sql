ALTER TABLE "private"."held_notification_recipient" ADD COLUMN "skipped_read" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "private"."whatsapp_message" ADD COLUMN "params" jsonb;--> statement-breakpoint
ALTER TABLE "private"."whatsapp_message" ADD COLUMN "template_body" text;--> statement-breakpoint
CREATE INDEX "held_notification_uncleared_idx" ON "private"."held_notification" USING btree ("key") WHERE "private"."held_notification"."cleared_at" is null;--> statement-breakpoint
CREATE INDEX "held_notification_recipient_batch_id_idx" ON "private"."held_notification_recipient" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "notification_createdAt_idx" ON "notification" USING btree ("created_at");
