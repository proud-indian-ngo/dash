ALTER TABLE "reimbursement" DROP CONSTRAINT "reimbursement_rejection_reason_chk";--> statement-breakpoint
ALTER TABLE "vendor_payment" DROP CONSTRAINT "vendor_payment_rejection_reason_chk";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'unoriented_volunteer';--> statement-breakpoint
ALTER TABLE "reimbursement" ALTER COLUMN "expense_date" SET DATA TYPE date USING expense_date::date;--> statement-breakpoint
ALTER TABLE "vendor_payment" ALTER COLUMN "invoice_date" SET DATA TYPE date USING invoice_date::date;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_rejection_reason_chk" CHECK (((status = 'rejected'::reimbursement_status) AND (rejection_reason IS NOT NULL)) OR ((status <> 'rejected'::reimbursement_status) AND (rejection_reason IS NULL)));--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_rejection_reason_chk" CHECK (((status = 'rejected'::vendor_payment_status) AND (rejection_reason IS NOT NULL)) OR ((status <> 'rejected'::vendor_payment_status) AND (rejection_reason IS NULL)));