ALTER TABLE "bank_account" ALTER COLUMN "id" SET DATA TYPE uuid USING id::uuid;--> statement-breakpoint
ALTER TABLE "bank_account" ALTER COLUMN "created_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "bank_account" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_account_userId_accountNumber_uidx" ON "bank_account" USING btree ("user_id","account_number");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_account_userId_isDefault_uidx" ON "bank_account" USING btree ("user_id") WHERE is_default = true;--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_ifsc_format_chk" CHECK (ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$');