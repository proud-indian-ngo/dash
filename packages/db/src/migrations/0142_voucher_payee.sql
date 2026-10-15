ALTER TABLE "reimbursement_line_item" ADD COLUMN "payee_name" text;--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" ADD COLUMN "payee_phone" text;--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" ADD COLUMN "signed_voucher_attachment_id" uuid;--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" ADD CONSTRAINT "reimbursement_line_item_signed_voucher_attachment_id_reimbursement_attachment_id_fk" FOREIGN KEY ("signed_voucher_attachment_id") REFERENCES "public"."reimbursement_attachment"("id") ON DELETE set null ON UPDATE no action;