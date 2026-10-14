CREATE TYPE "public"."statement_line_direction" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "public"."statement_line_ignore_reason" AS ENUM('bank_interest', 'reversal', 'not_ours', 'other');--> statement-breakpoint
CREATE TYPE "public"."statement_line_match_kind" AS ENUM('settlement', 'contribution', 'giveindia_payout', 'transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."statement_line_match_status" AS ENUM('unmatched', 'matched', 'ignored');--> statement-breakpoint
ALTER TYPE "public"."import_batch_source" ADD VALUE 'bank_csv';--> statement-breakpoint
CREATE TABLE "statement_line" (
	"amount_paise" bigint NOT NULL,
	"balance_paise" bigint,
	"created_at" timestamp NOT NULL,
	"direction" "statement_line_direction" NOT NULL,
	"dismissed_suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ignored_reason" "statement_line_ignore_reason",
	"id" uuid PRIMARY KEY NOT NULL,
	"import_batch_id" uuid,
	"line_hash" text NOT NULL,
	"matched_at" timestamp,
	"matched_by" text,
	"matched_contribution_id" uuid,
	"matched_settlement_id" uuid,
	"match_kind" "statement_line_match_kind",
	"match_reason" text,
	"match_status" "statement_line_match_status" DEFAULT 'unmatched' NOT NULL,
	"narration" text DEFAULT '' NOT NULL,
	"note" text,
	"org_account_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"reference" text,
	"suggested_contribution_id" uuid,
	"suggested_kind" "statement_line_match_kind",
	"suggested_settlement_id" uuid,
	"suggestion_reason" text,
	"updated_at" timestamp NOT NULL,
	"value_on" date NOT NULL,
	CONSTRAINT "statement_line_amount_positive" CHECK ("statement_line"."amount_paise" > 0),
	CONSTRAINT "statement_line_match_consistent" CHECK (("statement_line"."match_status"::text = 'matched') = ("statement_line"."match_kind" is not null)
        and (coalesce("statement_line"."match_kind"::text, '') = 'settlement') = ("statement_line"."matched_settlement_id" is not null)
        and (coalesce("statement_line"."match_kind"::text, '') = 'contribution') = ("statement_line"."matched_contribution_id" is not null)
        and ("statement_line"."match_status"::text = 'ignored') = ("statement_line"."ignored_reason" is not null)),
	CONSTRAINT "statement_line_credit_matches" CHECK ("statement_line"."direction"::text = 'credit' or coalesce("statement_line"."match_kind"::text, 'other') in ('transfer', 'other'))
);
--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_matched_by_user_id_fk" FOREIGN KEY ("matched_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_matched_contribution_id_contribution_id_fk" FOREIGN KEY ("matched_contribution_id") REFERENCES "public"."contribution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_matched_settlement_id_gateway_settlement_id_fk" FOREIGN KEY ("matched_settlement_id") REFERENCES "public"."gateway_settlement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_org_account_id_org_account_id_fk" FOREIGN KEY ("org_account_id") REFERENCES "public"."org_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_suggested_contribution_id_contribution_id_fk" FOREIGN KEY ("suggested_contribution_id") REFERENCES "public"."contribution"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_suggested_settlement_id_gateway_settlement_id_fk" FOREIGN KEY ("suggested_settlement_id") REFERENCES "public"."gateway_settlement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "statement_line_account_hash_uidx" ON "statement_line" USING btree ("org_account_id","line_hash");--> statement-breakpoint
CREATE INDEX "statement_line_account_valueOn_idx" ON "statement_line" USING btree ("org_account_id","value_on");--> statement-breakpoint
CREATE INDEX "statement_line_importBatchId_idx" ON "statement_line" USING btree ("import_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statement_line_matched_settlement_uidx" ON "statement_line" USING btree ("matched_settlement_id") WHERE "statement_line"."matched_settlement_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "statement_line_matched_contribution_uidx" ON "statement_line" USING btree ("matched_contribution_id") WHERE "statement_line"."matched_contribution_id" is not null;--> statement-breakpoint
CREATE INDEX "statement_line_suggestedSettlementId_idx" ON "statement_line" USING btree ("suggested_settlement_id");--> statement-breakpoint
CREATE INDEX "statement_line_suggestedContributionId_idx" ON "statement_line" USING btree ("suggested_contribution_id");