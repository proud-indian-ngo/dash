CREATE TYPE "public"."contribution_receipt_delivery_failure" AS ENUM('donor_changed', 'no_contact', 'no_phone', 'email_suppressed', 'email_not_configured', 'email_failed', 'whatsapp_no_template', 'whatsapp_not_configured', 'whatsapp_rejected', 'whatsapp_failed');--> statement-breakpoint
ALTER TABLE "contribution_receipt" ADD COLUMN "auto_send_at" timestamp;--> statement-breakpoint
ALTER TABLE "contribution_receipt" ADD COLUMN "delivery_failure" "contribution_receipt_delivery_failure";--> statement-breakpoint
ALTER TABLE "contribution_receipt" ADD COLUMN "whatsapp_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "private"."contribution_receipt_snapshot" ADD COLUMN "party_id" uuid;--> statement-breakpoint
-- Receipts issued before this froze no donor; their gift's donor is the best record.
UPDATE "private"."contribution_receipt_snapshot" s SET "party_id" = c."party_id"
FROM "contribution_receipt" r JOIN "contribution" c ON c."id" = r."contribution_id"
WHERE r."id" = s."receipt_id";--> statement-breakpoint
ALTER TABLE "private"."contribution_receipt_snapshot" ALTER COLUMN "party_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "private"."contribution_receipt_snapshot" ADD CONSTRAINT "contribution_receipt_snapshot_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE restrict ON UPDATE no action;