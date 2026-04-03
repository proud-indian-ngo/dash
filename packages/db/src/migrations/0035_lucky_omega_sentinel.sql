UPDATE "advance_payment" SET "status" = 'pending' WHERE "status" = 'draft';--> statement-breakpoint
UPDATE "reimbursement" SET "status" = 'pending' WHERE "status" = 'draft';--> statement-breakpoint
UPDATE "reimbursement" SET "submitted_at" = "created_at" WHERE "submitted_at" IS NULL AND "status" = 'pending';--> statement-breakpoint
UPDATE "advance_payment" SET "submitted_at" = "created_at" WHERE "submitted_at" IS NULL AND "status" = 'pending';--> statement-breakpoint
ALTER TABLE "advance_payment" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "advance_payment" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."advance_payment_status";--> statement-breakpoint
CREATE TYPE "public"."advance_payment_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "advance_payment" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."advance_payment_status";--> statement-breakpoint
ALTER TABLE "advance_payment" ALTER COLUMN "status" SET DATA TYPE "public"."advance_payment_status" USING "status"::"public"."advance_payment_status";--> statement-breakpoint
ALTER TABLE "reimbursement" DROP CONSTRAINT IF EXISTS "reimbursement_rejection_reason_chk";--> statement-breakpoint
ALTER TABLE "reimbursement" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "reimbursement" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."reimbursement_status";--> statement-breakpoint
CREATE TYPE "public"."reimbursement_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "reimbursement" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."reimbursement_status";--> statement-breakpoint
ALTER TABLE "reimbursement" ALTER COLUMN "status" SET DATA TYPE "public"."reimbursement_status" USING "status"::"public"."reimbursement_status";--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_rejection_reason_chk" CHECK (((status = 'rejected'::"public"."reimbursement_status") AND (rejection_reason IS NOT NULL)) OR ((status <> 'rejected'::"public"."reimbursement_status") AND (rejection_reason IS NULL)));
