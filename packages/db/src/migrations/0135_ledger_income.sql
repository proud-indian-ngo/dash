CREATE TYPE "public"."ledger_source_status" AS ENUM('posted', 'waiting', 'none');--> statement-breakpoint
CREATE TABLE "ledger_source_state" (
	"attention_count" integer DEFAULT 0 NOT NULL,
	"checked_at" timestamp NOT NULL,
	"economic_on" date,
	"id" uuid PRIMARY KEY NOT NULL,
	"message" text,
	"posted_on" date,
	"reason" text,
	"source_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_updated_at" timestamp,
	"status" "ledger_source_status" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "statement_line" ADD COLUMN "transfer_org_account_id" uuid;--> statement-breakpoint
ALTER TABLE "statement_line" ADD COLUMN "transfer_pair_line_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_source_state_source_uidx" ON "ledger_source_state" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "ledger_source_state_status_idx" ON "ledger_source_state" USING btree ("status","economic_on");--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_transfer_org_account_id_org_account_id_fk" FOREIGN KEY ("transfer_org_account_id") REFERENCES "public"."org_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_transfer_pair_line_id_statement_line_id_fk" FOREIGN KEY ("transfer_pair_line_id") REFERENCES "public"."statement_line"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "statement_line_transfer_pair_uidx" ON "statement_line" USING btree ("transfer_pair_line_id") WHERE "statement_line"."transfer_pair_line_id" is not null;--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_transfer_pair" CHECK ("statement_line"."transfer_pair_line_id" is null or (coalesce("statement_line"."match_kind"::text, '') = 'transfer' and "statement_line"."transfer_pair_line_id" <> "statement_line"."id"));--> statement-breakpoint
ALTER TABLE "statement_line" ADD CONSTRAINT "statement_line_transfer_account" CHECK ("statement_line"."transfer_org_account_id" is null or (coalesce("statement_line"."match_kind"::text, '') = 'transfer' and "statement_line"."transfer_org_account_id" <> "statement_line"."org_account_id"));