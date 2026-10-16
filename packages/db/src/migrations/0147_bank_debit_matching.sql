CREATE TYPE "public"."statement_allocation_kind" AS ENUM('reimbursement', 'vendor_payment_transaction', 'bank_charges', 'tax_payment');--> statement-breakpoint
ALTER TYPE "public"."statement_line_match_kind" ADD VALUE 'expense';--> statement-breakpoint
CREATE TABLE "statement_allocation" (
	"amount_paise" bigint NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text,
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "statement_allocation_kind" NOT NULL,
	"reimbursement_id" uuid,
	"released_at" timestamp,
	"released_by" text,
	"statement_line_id" uuid NOT NULL,
	"vendor_payment_transaction_id" uuid,
	CONSTRAINT "statement_allocation_amount_positive" CHECK ("statement_allocation"."amount_paise" > 0),
	CONSTRAINT "statement_allocation_target" CHECK (("statement_allocation"."kind"::text = 'reimbursement') = ("statement_allocation"."reimbursement_id" is not null)
        and ("statement_allocation"."kind"::text = 'vendor_payment_transaction') = ("statement_allocation"."vendor_payment_transaction_id" is not null)),
	CONSTRAINT "statement_allocation_released" CHECK ("statement_allocation"."released_by" is null or "statement_allocation"."released_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "statement_line" DROP CONSTRAINT "statement_line_credit_matches";--> statement-breakpoint
ALTER TABLE "statement_line" ADD COLUMN "needs_claim_at" timestamp;--> statement-breakpoint
ALTER TABLE "statement_line" ADD COLUMN "needs_claim_by" text;--> statement-breakpoint
ALTER TABLE "statement_allocation" ADD CONSTRAINT "statement_allocation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_allocation" ADD CONSTRAINT "statement_allocation_reimbursement_id_reimbursement_id_fk" FOREIGN KEY ("reimbursement_id") REFERENCES "public"."reimbursement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_allocation" ADD CONSTRAINT "statement_allocation_released_by_user_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_allocation" ADD CONSTRAINT "statement_allocation_statement_line_id_statement_line_id_fk" FOREIGN KEY ("statement_line_id") REFERENCES "public"."statement_line"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_allocation" ADD CONSTRAINT "statement_allocation_vendor_payment_transaction_id_vendor_payment_transaction_id_fk" FOREIGN KEY ("vendor_payment_transaction_id") REFERENCES "public"."vendor_payment_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "statement_allocation_lineId_idx" ON "statement_allocation" USING btree ("statement_line_id");--> statement-breakpoint
CREATE INDEX "statement_allocation_reimbursementId_idx" ON "statement_allocation" USING btree ("reimbursement_id");--> statement-breakpoint
CREATE INDEX "statement_allocation_vptId_idx" ON "statement_allocation" USING btree ("vendor_payment_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statement_allocation_live_reimbursement_uidx" ON "statement_allocation" USING btree ("statement_line_id","reimbursement_id") WHERE "statement_allocation"."reimbursement_id" is not null and "statement_allocation"."released_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "statement_allocation_live_vpt_uidx" ON "statement_allocation" USING btree ("statement_line_id","vendor_payment_transaction_id") WHERE "statement_allocation"."vendor_payment_transaction_id" is not null and "statement_allocation"."released_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "statement_allocation_live_charge_uidx" ON "statement_allocation" USING btree ("statement_line_id","kind") WHERE "statement_allocation"."kind" in ('bank_charges', 'tax_payment') and "statement_allocation"."released_at" is null;--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_needs_claim_by_user_id_fk" FOREIGN KEY ("needs_claim_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_expense_matches" CHECK ("statement_line"."direction"::text = 'debit' or coalesce("statement_line"."match_kind"::text, '') <> 'expense');--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_needs_claim_open" CHECK ("statement_line"."needs_claim_at" is null or "statement_line"."match_status"::text = 'unmatched');--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_credit_matches" CHECK ("statement_line"."direction"::text = 'credit' or coalesce("statement_line"."match_kind"::text, 'other') in ('transfer', 'other', 'expense'));