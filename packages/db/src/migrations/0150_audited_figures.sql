CREATE TYPE "public"."audited_figures_line_kind" AS ENUM('account', 'asset', 'liability', 'fund', 'fund_transfer');--> statement-breakpoint
CREATE TYPE "public"."audited_figures_status" AS ENUM('matched', 'skipped');--> statement-breakpoint
CREATE TABLE "audited_figures" (
	"as_on" date NOT NULL,
	"ca_name" text,
	"created_at" timestamp NOT NULL,
	"created_by" text,
	"fiscal_year_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"posting_id" uuid,
	"reversal_posting_id" uuid,
	"reversal_reason" text,
	"reversed_at" timestamp,
	"reversed_by" text,
	"signed_on" date,
	"skip_reason" text,
	"status" "audited_figures_status" NOT NULL,
	CONSTRAINT "audited_figures_status_check" CHECK (("audited_figures"."status" = 'matched' AND "audited_figures"."ca_name" IS NOT NULL AND "audited_figures"."signed_on" IS NOT NULL AND "audited_figures"."skip_reason" IS NULL) OR ("audited_figures"."status" = 'skipped' AND "audited_figures"."skip_reason" IS NOT NULL AND "audited_figures"."posting_id" IS NULL)),
	CONSTRAINT "audited_figures_reversal_check" CHECK ("audited_figures"."reversal_posting_id" IS NULL OR "audited_figures"."reversed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "audited_figures_line" (
	"account_head_id" uuid,
	"added" boolean DEFAULT false NOT NULL,
	"audited_figures_id" uuid NOT NULL,
	"audited_paise" bigint NOT NULL,
	"books_paise" bigint NOT NULL,
	"counter_head_id" uuid,
	"fund_id" uuid,
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "audited_figures_line_kind" NOT NULL,
	"line_key" text NOT NULL,
	"memo" text,
	"org_account_id" uuid,
	"position" integer NOT NULL,
	"to_fund_id" uuid
);
--> statement-breakpoint
ALTER TABLE "audited_figures" ADD CONSTRAINT "audited_figures_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audited_figures" ADD CONSTRAINT "audited_figures_fiscal_year_id_fiscal_year_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audited_figures" ADD CONSTRAINT "audited_figures_posting_id_posting_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."posting"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audited_figures" ADD CONSTRAINT "audited_figures_reversal_posting_id_posting_id_fk" FOREIGN KEY ("reversal_posting_id") REFERENCES "public"."posting"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audited_figures" ADD CONSTRAINT "audited_figures_reversed_by_user_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audited_figures_line" ADD CONSTRAINT "audited_figures_line_account_head_id_account_head_id_fk" FOREIGN KEY ("account_head_id") REFERENCES "public"."account_head"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audited_figures_line" ADD CONSTRAINT "audited_figures_line_audited_figures_id_audited_figures_id_fk" FOREIGN KEY ("audited_figures_id") REFERENCES "public"."audited_figures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audited_figures_line" ADD CONSTRAINT "audited_figures_line_counter_head_id_account_head_id_fk" FOREIGN KEY ("counter_head_id") REFERENCES "public"."account_head"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audited_figures_line" ADD CONSTRAINT "audited_figures_line_fund_id_fund_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."fund"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audited_figures_line" ADD CONSTRAINT "audited_figures_line_org_account_id_org_account_id_fk" FOREIGN KEY ("org_account_id") REFERENCES "public"."org_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audited_figures_line" ADD CONSTRAINT "audited_figures_line_to_fund_id_fund_id_fk" FOREIGN KEY ("to_fund_id") REFERENCES "public"."fund"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audited_figures_postingId_uidx" ON "audited_figures" USING btree ("posting_id") WHERE "audited_figures"."posting_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "audited_figures_live_year_uidx" ON "audited_figures" USING btree ("fiscal_year_id") WHERE "audited_figures"."reversed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "audited_figures_line_document_idx" ON "audited_figures_line" USING btree ("audited_figures_id","position");