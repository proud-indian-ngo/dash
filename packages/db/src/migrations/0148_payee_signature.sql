ALTER TABLE "reimbursement_line_item" ADD COLUMN "payee_signature_attachment_id" uuid;--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" ADD COLUMN "payee_signature_captured_at" timestamp;--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" ADD COLUMN "payee_signature_captured_by" text;--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" ADD COLUMN "payee_signature_statement" text;--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" ADD CONSTRAINT "reimbursement_line_item_payee_signature_attachment_id_reimbursement_attachment_id_fk" FOREIGN KEY ("payee_signature_attachment_id") REFERENCES "public"."reimbursement_attachment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" ADD CONSTRAINT "reimbursement_line_item_payee_signature_captured_by_user_id_fk" FOREIGN KEY ("payee_signature_captured_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;