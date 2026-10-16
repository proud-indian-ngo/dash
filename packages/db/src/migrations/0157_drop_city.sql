ALTER TABLE "team_event" ALTER COLUMN "cost_centre_id" SET DEFAULT '01930000-0000-7000-8000-000000000101';--> statement-breakpoint
ALTER TABLE "team_event" ALTER COLUMN "cost_centre_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "advance_payment" DROP COLUMN "city";--> statement-breakpoint
ALTER TABLE "reimbursement" DROP COLUMN "city";--> statement-breakpoint
ALTER TABLE "team_event" DROP COLUMN "city";--> statement-breakpoint
ALTER TABLE "vendor_payment" DROP COLUMN "city";--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_cost_centre_chk" CHECK ("reimbursement"."event_id" IS NULL OR "reimbursement"."cost_centre_id" IS NULL);--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_cost_centre_chk" CHECK (("vendor_payment"."event_id" IS NULL) <> ("vendor_payment"."cost_centre_id" IS NULL));--> statement-breakpoint
DROP TYPE "public"."reimbursement_city";