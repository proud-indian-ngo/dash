CREATE TYPE "public"."contribution_receipt_delivery_failure" AS ENUM('no_contact', 'no_phone', 'email_suppressed', 'email_not_configured', 'email_failed', 'whatsapp_no_template', 'whatsapp_not_configured', 'whatsapp_rejected', 'whatsapp_failed');--> statement-breakpoint
ALTER TABLE "contribution_receipt" ADD COLUMN "auto_send_at" timestamp;--> statement-breakpoint
ALTER TABLE "contribution_receipt" ADD COLUMN "delivery_failure" "contribution_receipt_delivery_failure";--> statement-breakpoint
ALTER TABLE "contribution_receipt" ADD COLUMN "whatsapp_sent_at" timestamp;