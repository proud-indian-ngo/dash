ALTER TYPE "public"."history_action" ADD VALUE 'voided';--> statement-breakpoint
ALTER TABLE "reimbursement" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "vendor_payment_transaction" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "vendor_payment_transaction" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "vendor_payment_transaction" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment_transaction" ADD CONSTRAINT "vendor_payment_transaction_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_void_chk" CHECK ((voided_at IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND void_reason IS NOT NULL));--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_void_chk" CHECK ((voided_at IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND void_reason IS NOT NULL));--> statement-breakpoint
ALTER TABLE "vendor_payment_transaction" ADD CONSTRAINT "vpt_void_chk" CHECK ((voided_at IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND void_reason IS NOT NULL));