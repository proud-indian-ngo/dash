CREATE TYPE "public"."account_movement_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."account_movement_kind" AS ENUM('receipt', 'payout', 'transfer', 'refund', 'fee', 'tax_remittance', 'opening');--> statement-breakpoint
CREATE TYPE "public"."fiscal_year_event_action" AS ENUM('close', 'reopen');--> statement-breakpoint
CREATE TYPE "public"."ledger_effect" AS ENUM('increase', 'decrease');--> statement-breakpoint
CREATE TYPE "public"."ledger_medium" AS ENUM('monetary', 'in_kind');--> statement-breakpoint
ALTER TYPE "public"."account_head_type" ADD VALUE 'fund';--> statement-breakpoint
ALTER TYPE "public"."org_account_kind" ADD VALUE 'deposit';--> statement-breakpoint
CREATE TABLE "account_movement" (
	"amount_paise" bigint NOT NULL,
	"bank_value_on" date,
	"direction" "account_movement_direction" NOT NULL,
	"fiscal_period_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "account_movement_kind" NOT NULL,
	"memo" text,
	"occurred_on" date NOT NULL,
	"org_account_id" uuid NOT NULL,
	"payment_reference" text,
	"posted_on" date NOT NULL,
	"posting_id" uuid NOT NULL,
	"reverses_movement_id" uuid,
	"transfer_id" uuid,
	CONSTRAINT "account_movement_amount_check" CHECK ("account_movement"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "fiscal_year_event" (
	"action" "fiscal_year_event_action" NOT NULL,
	"actor_id" text,
	"fiscal_year_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"account_head_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"cost_centre_id" uuid,
	"economic_on" date NOT NULL,
	"effect" "ledger_effect" NOT NULL,
	"event_id" uuid,
	"fiscal_period_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"medium" "ledger_medium" DEFAULT 'monetary' NOT NULL,
	"memo" text,
	"party_id" uuid,
	"posted_on" date NOT NULL,
	"posting_id" uuid NOT NULL,
	"programme_id" uuid,
	"project_id" uuid,
	"reverses_entry_id" uuid,
	"source_line_id" uuid,
	CONSTRAINT "ledger_entry_amount_check" CHECK ("ledger_entry"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "movement_allocation" (
	"account_movement_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"created_at" timestamp NOT NULL,
	"document_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	CONSTRAINT "movement_allocation_amount_check" CHECK ("movement_allocation"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "opening_balance" (
	"as_on" date NOT NULL,
	"ca_confirmed_on" date NOT NULL,
	"ca_name" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text,
	"fiscal_year_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"posting_id" uuid NOT NULL,
	"reversal_posting_id" uuid,
	"reversed_at" timestamp,
	"reversed_by" text
);
--> statement-breakpoint
CREATE TABLE "posting" (
	"action" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text,
	"economic_on" date NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"posted_on" date NOT NULL,
	"reason" text,
	"reverses_posting_id" uuid,
	"source_id" uuid NOT NULL,
	"source_revision" integer DEFAULT 1 NOT NULL,
	"source_type" text NOT NULL,
	CONSTRAINT "posting_source_revision_check" CHECK ("posting"."source_revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "fiscal_year" ADD COLUMN "closed_by" text;--> statement-breakpoint
ALTER TABLE "account_movement" ADD CONSTRAINT "account_movement_fiscal_period_id_fiscal_period_id_fk" FOREIGN KEY ("fiscal_period_id") REFERENCES "public"."fiscal_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_movement" ADD CONSTRAINT "account_movement_org_account_id_org_account_id_fk" FOREIGN KEY ("org_account_id") REFERENCES "public"."org_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_movement" ADD CONSTRAINT "account_movement_posting_id_posting_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."posting"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_movement" ADD CONSTRAINT "account_movement_reverses_movement_id_account_movement_id_fk" FOREIGN KEY ("reverses_movement_id") REFERENCES "public"."account_movement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_year_event" ADD CONSTRAINT "fiscal_year_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_year_event" ADD CONSTRAINT "fiscal_year_event_fiscal_year_id_fiscal_year_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_account_head_id_account_head_id_fk" FOREIGN KEY ("account_head_id") REFERENCES "public"."account_head"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_cost_centre_id_cost_centre_id_fk" FOREIGN KEY ("cost_centre_id") REFERENCES "public"."cost_centre"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_fiscal_period_id_fiscal_period_id_fk" FOREIGN KEY ("fiscal_period_id") REFERENCES "public"."fiscal_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_fund_id_fund_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."fund"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_posting_id_posting_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."posting"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_programme_id_programme_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programme"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_reverses_entry_id_ledger_entry_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "public"."ledger_entry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_allocation" ADD CONSTRAINT "movement_allocation_account_movement_id_account_movement_id_fk" FOREIGN KEY ("account_movement_id") REFERENCES "public"."account_movement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_balance_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_balance_fiscal_year_id_fiscal_year_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_balance_posting_id_posting_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."posting"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_balance_reversal_posting_id_posting_id_fk" FOREIGN KEY ("reversal_posting_id") REFERENCES "public"."posting"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_balance_reversed_by_user_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posting" ADD CONSTRAINT "posting_fiscal_year_id_fiscal_year_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posting" ADD CONSTRAINT "posting_reverses_posting_id_posting_id_fk" FOREIGN KEY ("reverses_posting_id") REFERENCES "public"."posting"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_movement_postingId_idx" ON "account_movement" USING btree ("posting_id");--> statement-breakpoint
CREATE INDEX "account_movement_account_occurredOn_idx" ON "account_movement" USING btree ("org_account_id","occurred_on","id");--> statement-breakpoint
CREATE INDEX "account_movement_transferId_idx" ON "account_movement" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "fiscal_year_event_year_idx" ON "fiscal_year_event" USING btree ("fiscal_year_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ledger_entry_postingId_idx" ON "ledger_entry" USING btree ("posting_id");--> statement-breakpoint
CREATE INDEX "ledger_entry_economicOn_idx" ON "ledger_entry" USING btree ("economic_on","id");--> statement-breakpoint
CREATE INDEX "ledger_entry_accountHeadId_idx" ON "ledger_entry" USING btree ("account_head_id");--> statement-breakpoint
CREATE INDEX "ledger_entry_fiscalPeriodId_idx" ON "ledger_entry" USING btree ("fiscal_period_id");--> statement-breakpoint
CREATE INDEX "movement_allocation_movementId_idx" ON "movement_allocation" USING btree ("account_movement_id");--> statement-breakpoint
CREATE INDEX "movement_allocation_document_idx" ON "movement_allocation" USING btree ("document_type","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_balance_postingId_uidx" ON "opening_balance" USING btree ("posting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_balance_live_year_uidx" ON "opening_balance" USING btree ("fiscal_year_id") WHERE "opening_balance"."reversal_posting_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "posting_idempotency_uidx" ON "posting" USING btree ("source_type","source_id","source_revision","action");--> statement-breakpoint
CREATE UNIQUE INDEX "posting_reverses_uidx" ON "posting" USING btree ("reverses_posting_id") WHERE "posting"."reverses_posting_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "posting_fiscalYearId_idx" ON "posting" USING btree ("fiscal_year_id");--> statement-breakpoint
ALTER TABLE "fiscal_year" ADD CONSTRAINT "fiscal_year_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;