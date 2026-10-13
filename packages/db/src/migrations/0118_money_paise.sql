-- Store every money amount as integer paise in a bigint column (see
-- docs/architecture/finance-and-programmes.md, "Money type"). Each
-- numeric(12,2) rupee column becomes amount_paise: add, backfill, set NOT
-- NULL, drop the old column. None of these columns carries a CHECK
-- constraint, so there is nothing to carry over.
--
-- numeric(12,2) times 100 is always a whole number, but the guard below
-- aborts the migration (and with it the deploy) rather than silently
-- rounding if any row ever holds more than two decimal places.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "advance_payment_line_item" WHERE "amount" * 100 <> round("amount" * 100))
    OR EXISTS (SELECT 1 FROM "reimbursement_line_item" WHERE "amount" * 100 <> round("amount" * 100))
    OR EXISTS (SELECT 1 FROM "vendor_payment_line_item" WHERE "amount" * 100 <> round("amount" * 100))
    OR EXISTS (SELECT 1 FROM "vendor_payment_transaction" WHERE "amount" * 100 <> round("amount" * 100))
  THEN
    RAISE EXCEPTION 'money_paise: an amount has more than two decimal places; fix it before migrating';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "advance_payment_line_item" ADD COLUMN "amount_paise" bigint;--> statement-breakpoint
UPDATE "advance_payment_line_item" SET "amount_paise" = round("amount" * 100)::bigint;--> statement-breakpoint
ALTER TABLE "advance_payment_line_item" ALTER COLUMN "amount_paise" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "advance_payment_line_item" DROP COLUMN "amount";--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" ADD COLUMN "amount_paise" bigint;--> statement-breakpoint
UPDATE "reimbursement_line_item" SET "amount_paise" = round("amount" * 100)::bigint;--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" ALTER COLUMN "amount_paise" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" DROP COLUMN "amount";--> statement-breakpoint
ALTER TABLE "vendor_payment_line_item" ADD COLUMN "amount_paise" bigint;--> statement-breakpoint
UPDATE "vendor_payment_line_item" SET "amount_paise" = round("amount" * 100)::bigint;--> statement-breakpoint
ALTER TABLE "vendor_payment_line_item" ALTER COLUMN "amount_paise" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_payment_line_item" DROP COLUMN "amount";--> statement-breakpoint
ALTER TABLE "vendor_payment_transaction" ADD COLUMN "amount_paise" bigint;--> statement-breakpoint
UPDATE "vendor_payment_transaction" SET "amount_paise" = round("amount" * 100)::bigint;--> statement-breakpoint
ALTER TABLE "vendor_payment_transaction" ALTER COLUMN "amount_paise" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_payment_transaction" DROP COLUMN "amount";
