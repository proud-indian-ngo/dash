ALTER TABLE "reimbursement" ADD COLUMN "lead_approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD COLUMN "lead_approved_by" text;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD COLUMN "lead_skip_reason" text;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "lead_approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "lead_approved_by" text;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "lead_skip_reason" text;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_lead_approved_by_user_id_fk" FOREIGN KEY ("lead_approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_lead_approved_by_user_id_fk" FOREIGN KEY ("lead_approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'pi_dash_public' AND schemaname = 'public' AND tablename = 'programme'
  ) THEN
    ALTER PUBLICATION pi_dash_public DROP TABLE "public"."programme";
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "programme" DROP COLUMN "finance_threshold_paise";--> statement-breakpoint
DELETE FROM "app_config" WHERE "key" = 'finance_threshold_default_paise';--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_lead_approval_chk" CHECK ("reimbursement"."lead_approved_at" IS NULL OR "reimbursement"."lead_skip_reason" IS NULL);--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_lead_approval_chk" CHECK ("vendor_payment"."lead_approved_at" IS NULL OR "vendor_payment"."lead_skip_reason" IS NULL);--> statement-breakpoint
-- Requests already pending when lead approval begins go straight to finance,
-- as they would have: they don't start waiting for a lead.
UPDATE "reimbursement" r
SET "lead_skip_reason" = 'Submitted before lead approval began'
FROM "programme" p
WHERE r."status" = 'pending'
  AND r."charged_to" <> 'organisation'
  AND p."id" = COALESCE(
    r."charged_programme_id",
    (SELECT e."programme_id" FROM "team_event" e WHERE e."id" = r."event_id")
  )
  AND p."id" <> '01930000-0000-7000-8000-000000000009'
  AND p."lead_user_id" IS NOT NULL
  AND p."lead_user_id" <> r."user_id"
  AND p."lead_user_id" IS DISTINCT FROM r."created_by";--> statement-breakpoint
UPDATE "vendor_payment" v
SET "lead_skip_reason" = 'Submitted before lead approval began'
FROM "programme" p
WHERE v."status" = 'pending'
  AND v."charged_to" <> 'organisation'
  AND p."id" = COALESCE(
    v."charged_programme_id",
    (SELECT e."programme_id" FROM "team_event" e WHERE e."id" = v."event_id")
  )
  AND p."id" <> '01930000-0000-7000-8000-000000000009'
  AND p."lead_user_id" IS NOT NULL
  AND p."lead_user_id" <> v."user_id";
