ALTER TYPE "public"."import_batch_source" ADD VALUE 'razorpay_api';--> statement-breakpoint
ALTER TYPE "private"."external_identity_provider" ADD VALUE 'razorpay';--> statement-breakpoint
ALTER TABLE "import_batch" ALTER COLUMN "org_account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "private"."import_row" ALTER COLUMN "retain_until" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batch" ADD COLUMN "pending_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_account_unless_razorpay" CHECK ("import_batch"."source"::text = 'razorpay_api' OR "import_batch"."org_account_id" IS NOT NULL);