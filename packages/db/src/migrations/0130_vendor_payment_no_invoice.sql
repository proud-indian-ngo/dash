CREATE TYPE "public"."vendor_payment_no_invoice_reason" AS ENUM('rent', 'statutory', 'other');--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "no_invoice_note" text;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "no_invoice_reason" "vendor_payment_no_invoice_reason";--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_invoice_or_no_invoice_chk" CHECK ("vendor_payment"."no_invoice_reason" IS NULL OR "vendor_payment"."invoice_number" IS NULL);