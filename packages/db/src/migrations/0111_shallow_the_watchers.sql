CREATE TYPE "public"."account_head_type" AS ENUM('income', 'expense', 'asset', 'liability');--> statement-breakpoint
CREATE TYPE "public"."fcra_role" AS ENUM('none', 'receipt', 'utilisation');--> statement-breakpoint
CREATE TYPE "public"."fund_restriction" AS ENUM('unrestricted', 'restricted', 'designated');--> statement-breakpoint
CREATE TYPE "public"."fund_source" AS ENUM('domestic', 'fcra');--> statement-breakpoint
CREATE TYPE "public"."org_account_kind" AS ENUM('bank', 'cash', 'gateway_clearing');--> statement-breakpoint
CREATE TYPE "public"."organisation_registration_type" AS ENUM('pan', 'tan', '12ab', '80g', 'fcra', 'csr1', 'darpan');--> statement-breakpoint
CREATE TYPE "public"."project_kind" AS ENUM('class', 'edition', 'drive', 'engagement', 'other');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planned', 'active', 'closed');--> statement-breakpoint
CREATE TABLE "account_head" (
	"active" boolean DEFAULT true NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"description" text,
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"tally_ledger_name" text,
	"type" "account_head_type" NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_centre" (
	"active" boolean DEFAULT true NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state_ut" text,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_period" (
	"closed_at" timestamp,
	"closed_by" text,
	"ends_on" date NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"month" integer NOT NULL,
	"starts_on" date NOT NULL,
	CONSTRAINT "fiscal_period_month_check" CHECK ("fiscal_period"."month" BETWEEN 1 AND 12),
	CONSTRAINT "fiscal_period_range_check" CHECK ("fiscal_period"."ends_on" >= "fiscal_period"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "fiscal_year" (
	"closed_at" timestamp,
	"ends_on" date NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"starts_on" date NOT NULL,
	CONSTRAINT "fiscal_year_range_check" CHECK ("fiscal_year"."ends_on" > "fiscal_year"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "fund" (
	"active" boolean DEFAULT true NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"description" text,
	"grant_agreement_id" uuid,
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"restriction" "fund_restriction" DEFAULT 'unrestricted' NOT NULL,
	"source" "fund_source" DEFAULT 'domestic' NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_account" (
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL,
	"fcra_role" "fcra_role" DEFAULT 'none' NOT NULL,
	"fund_source" "fund_source" DEFAULT 'domestic' NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "org_account_kind" NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisation_registration" (
	"created_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"issued_on" date,
	"number" text NOT NULL,
	"scope_note" text,
	"type" "organisation_registration_type" NOT NULL,
	"updated_at" timestamp NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "programme" (
	"active" boolean DEFAULT true NOT NULL,
	"cause" text,
	"code" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"description" text,
	"finance_threshold_paise" bigint,
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_user_id" text,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"code" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"description" text,
	"ends_on" date,
	"id" uuid PRIMARY KEY NOT NULL,
	"intermediary_party_id" uuid,
	"kind" "project_kind" DEFAULT 'other' NOT NULL,
	"name" text NOT NULL,
	"programme_id" uuid NOT NULL,
	"quoted_budget_paise" bigint,
	"report_due_on" date,
	"sponsor_party_id" uuid,
	"starts_on" date,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_head" ADD CONSTRAINT "account_head_parent_id_account_head_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."account_head"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_period" ADD CONSTRAINT "fiscal_period_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_period" ADD CONSTRAINT "fiscal_period_fiscal_year_id_fiscal_year_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme" ADD CONSTRAINT "programme_lead_user_id_user_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_programme_id_programme_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programme"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_head_code_uidx" ON "account_head" USING btree ("code");--> statement-breakpoint
CREATE INDEX "account_head_parentId_idx" ON "account_head" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_centre_code_uidx" ON "cost_centre" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_period_year_month_uidx" ON "fiscal_period" USING btree ("fiscal_year_id","month");--> statement-breakpoint
CREATE INDEX "fiscal_period_startsOn_idx" ON "fiscal_period" USING btree ("starts_on");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_year_label_uidx" ON "fiscal_year" USING btree ("label");--> statement-breakpoint
CREATE UNIQUE INDEX "fund_code_uidx" ON "fund" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "org_account_name_uidx" ON "org_account" USING btree ("name");--> statement-breakpoint
CREATE INDEX "organisation_registration_type_idx" ON "organisation_registration" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "programme_code_uidx" ON "programme" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "programme_name_uidx" ON "programme" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "project_code_uidx" ON "project" USING btree ("code");--> statement-breakpoint
CREATE INDEX "project_programmeId_idx" ON "project" USING btree ("programme_id");