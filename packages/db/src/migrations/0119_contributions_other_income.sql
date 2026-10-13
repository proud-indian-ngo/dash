CREATE TYPE "public"."contribution_channel" AS ENUM('razorpay', 'give_do', 'upi', 'neft', 'cheque', 'cash', 'in_kind');--> statement-breakpoint
CREATE TYPE "public"."contribution_reporting_mode" AS ENUM('cash', 'electronic_or_account_payee', 'in_kind', 'other');--> statement-breakpoint
CREATE TYPE "public"."contribution_source" AS ENUM('manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."contribution_status" AS ENUM('pending', 'received', 'receipted', 'refunded', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."deduction_eligible" AS ENUM('yes', 'no', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."donation_type" AS ENUM('corpus', 'voluntary', 'specific_grant', 'csr', 'other');--> statement-breakpoint
CREATE TYPE "public"."other_income_kind" AS ENUM('interest', 'grant_return', 'asset_income', 'misc');--> statement-breakpoint
CREATE TABLE "contribution" (
	"amount_paise" bigint NOT NULL,
	"channel" "contribution_channel" NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"deduction_eligible" "deduction_eligible" DEFAULT 'unknown' NOT NULL,
	"donation_type" "donation_type" DEFAULT 'voluntary' NOT NULL,
	"donation_type_description" text,
	"eligibility_reason" text,
	"fund_id" uuid NOT NULL,
	"gateway_fee_paise" bigint DEFAULT 0 NOT NULL,
	"gateway_tax_paise" bigint DEFAULT 0 NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"in_kind_description" text,
	"in_kind_valuation_basis" text,
	"intermediary_party_id" uuid,
	"notes" text,
	"org_account_id" uuid,
	"original_amount_paise" bigint,
	"original_currency" text,
	"party_id" uuid NOT NULL,
	"programme_id" uuid,
	"project_id" uuid,
	"received_on" date NOT NULL,
	"reference" text,
	"reporting_mode" "contribution_reporting_mode" NOT NULL,
	"reporting_mode_description" text,
	"source" "contribution_source" DEFAULT 'manual' NOT NULL,
	"status" "contribution_status" DEFAULT 'received' NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "contribution_amount_positive" CHECK ("contribution"."amount_paise" > 0),
	CONSTRAINT "contribution_gateway_charges_nonnegative" CHECK ("contribution"."gateway_fee_paise" >= 0 AND "contribution"."gateway_tax_paise" >= 0),
	CONSTRAINT "contribution_account_unless_in_kind" CHECK ("contribution"."channel" = 'in_kind' OR "contribution"."org_account_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "other_income" (
	"amount_paise" bigint NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text,
	"description" text,
	"fund_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "other_income_kind" NOT NULL,
	"org_account_id" uuid NOT NULL,
	"received_on" date NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "other_income_amount_positive" CHECK ("other_income"."amount_paise" > 0)
);
--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_fund_id_fund_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."fund"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_intermediary_party_id_party_id_fk" FOREIGN KEY ("intermediary_party_id") REFERENCES "public"."party"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_org_account_id_org_account_id_fk" FOREIGN KEY ("org_account_id") REFERENCES "public"."org_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_programme_id_programme_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programme"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "other_income" ADD CONSTRAINT "other_income_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "other_income" ADD CONSTRAINT "other_income_fund_id_fund_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."fund"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "other_income" ADD CONSTRAINT "other_income_org_account_id_org_account_id_fk" FOREIGN KEY ("org_account_id") REFERENCES "public"."org_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contribution_partyId_idx" ON "contribution" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "contribution_receivedOn_idx" ON "contribution" USING btree ("received_on");--> statement-breakpoint
CREATE INDEX "contribution_status_idx" ON "contribution" USING btree ("status");--> statement-breakpoint
CREATE INDEX "other_income_receivedOn_idx" ON "other_income" USING btree ("received_on");