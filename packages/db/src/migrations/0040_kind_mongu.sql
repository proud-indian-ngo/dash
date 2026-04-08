ALTER TABLE "reimbursement_line_item" ADD COLUMN "generate_voucher" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" ADD COLUMN "voucher_attachment_id" uuid;--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" ADD CONSTRAINT "reimbursement_line_item_voucher_attachment_id_reimbursement_attachment_id_fk" FOREIGN KEY ("voucher_attachment_id") REFERENCES "public"."reimbursement_attachment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS voucher_seq;