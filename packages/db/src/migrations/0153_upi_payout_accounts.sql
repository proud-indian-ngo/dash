ALTER TABLE "bank_account" DROP CONSTRAINT "bank_account_ifsc_format_chk";--> statement-breakpoint
ALTER TABLE "bank_account" ALTER COLUMN "account_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_account" ALTER COLUMN "ifsc_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "advance_payment" ADD COLUMN "bank_account_upi_id" text;--> statement-breakpoint
ALTER TABLE "bank_account" ADD COLUMN "upi_id" text;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD COLUMN "bank_account_upi_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_account_userId_upiId_uidx" ON "bank_account" USING btree ("user_id","upi_id");--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_payout_chk" CHECK ((account_number IS NULL) = (ifsc_code IS NULL) AND (account_number IS NOT NULL OR upi_id IS NOT NULL));--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_ifsc_format_chk" CHECK (ifsc_code IS NULL OR ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$');