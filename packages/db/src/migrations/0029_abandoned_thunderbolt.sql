CREATE TYPE "public"."attachment_purpose" AS ENUM('quotation', 'invoice');--> statement-breakpoint
ALTER TYPE "public"."history_action" ADD VALUE 'invoice_submitted';--> statement-breakpoint
ALTER TYPE "public"."history_action" ADD VALUE 'invoice_updated';--> statement-breakpoint
ALTER TYPE "public"."history_action" ADD VALUE 'invoice_approved';--> statement-breakpoint
ALTER TYPE "public"."history_action" ADD VALUE 'invoice_rejected';--> statement-breakpoint
ALTER TYPE "public"."vendor_payment_status" ADD VALUE 'invoice_pending';--> statement-breakpoint
ALTER TYPE "public"."vendor_payment_status" ADD VALUE 'completed';--> statement-breakpoint
ALTER TABLE "vendor_payment" ALTER COLUMN "invoice_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "invoice_reviewed_by" text;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "invoice_reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "invoice_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "vendor_payment_attachment" ADD COLUMN "purpose" "attachment_purpose" DEFAULT 'quotation' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_invoice_reviewed_by_user_id_fk" FOREIGN KEY ("invoice_reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;