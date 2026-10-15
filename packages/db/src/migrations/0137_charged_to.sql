CREATE TYPE "public"."expense_charged_to" AS ENUM('event', 'programme', 'organisation');--> statement-breakpoint
ALTER TABLE "reimbursement" ADD COLUMN "charged_programme_id" uuid;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD COLUMN "charged_project_id" uuid;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD COLUMN "charged_to" "expense_charged_to";--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "charged_programme_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "charged_project_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "charged_to" "expense_charged_to";--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_charged_programme_id_programme_id_fk" FOREIGN KEY ("charged_programme_id") REFERENCES "public"."programme"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_charged_programme_id_programme_id_fk" FOREIGN KEY ("charged_programme_id") REFERENCES "public"."programme"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reimbursement_chargedProgrammeId_idx" ON "reimbursement" USING btree ("charged_programme_id");--> statement-breakpoint
CREATE INDEX "vendor_payment_chargedProgrammeId_idx" ON "vendor_payment" USING btree ("charged_programme_id");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_id_programme_id_unique" UNIQUE("id","programme_id");