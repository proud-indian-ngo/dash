CREATE TYPE "public"."grant_donation_type" AS ENUM('csr', 'specific_grant');--> statement-breakpoint
CREATE TYPE "public"."grant_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TABLE "grant_agreement" (
	"agreement_filename" text,
	"agreement_mime_type" text,
	"agreement_object_key" text,
	"agreement_on" date,
	"agreement_reference" text,
	"created_at" timestamp NOT NULL,
	"donation_type" "grant_donation_type" NOT NULL,
	"ends_on" date NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"notes" text,
	"party_id" uuid NOT NULL,
	"programme_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"sanctioned_paise" bigint NOT NULL,
	"schedule_vii_item" text,
	"starts_on" date NOT NULL,
	"status" "grant_status" DEFAULT 'active' NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "grant_agreement_project_unique" UNIQUE("project_id"),
	CONSTRAINT "grant_agreement_link_unique" UNIQUE("id","party_id","programme_id","project_id"),
	CONSTRAINT "grant_agreement_sanctioned_positive" CHECK ("grant_agreement"."sanctioned_paise" > 0),
	CONSTRAINT "grant_agreement_period_check" CHECK ("grant_agreement"."ends_on" >= "grant_agreement"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "grant_budget_line" (
	"account_head_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"grant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	CONSTRAINT "grant_budget_line_grant_head_unique" UNIQUE("grant_id","account_head_id"),
	CONSTRAINT "grant_budget_line_amount_check" CHECK ("grant_budget_line"."amount_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "grant_tranche" (
	"amount_paise" bigint NOT NULL,
	"expected_on" date NOT NULL,
	"grant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"note" text,
	CONSTRAINT "grant_tranche_id_grant_unique" UNIQUE("id","grant_id"),
	CONSTRAINT "grant_tranche_amount_positive" CHECK ("grant_tranche"."amount_paise" > 0)
);
--> statement-breakpoint
ALTER TABLE "contribution" ADD COLUMN "grant_id" uuid;--> statement-breakpoint
ALTER TABLE "contribution" ADD COLUMN "grant_tranche_id" uuid;--> statement-breakpoint
ALTER TABLE "grant_agreement" ADD CONSTRAINT "grant_agreement_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_agreement" ADD CONSTRAINT "grant_agreement_programme_id_programme_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programme"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_agreement" ADD CONSTRAINT "grant_agreement_project_programme_fk" FOREIGN KEY ("project_id","programme_id") REFERENCES "public"."project"("id","programme_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_line" ADD CONSTRAINT "grant_budget_line_account_head_id_account_head_id_fk" FOREIGN KEY ("account_head_id") REFERENCES "public"."account_head"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_budget_line" ADD CONSTRAINT "grant_budget_line_grant_id_grant_agreement_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grant_agreement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_tranche" ADD CONSTRAINT "grant_tranche_grant_id_grant_agreement_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grant_agreement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grant_agreement_partyId_idx" ON "grant_agreement" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "grant_tranche_grantId_idx" ON "grant_tranche" USING btree ("grant_id");--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_grant_fk" FOREIGN KEY ("grant_id","party_id","programme_id","project_id") REFERENCES "public"."grant_agreement"("id","party_id","programme_id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_grant_tranche_fk" FOREIGN KEY ("grant_tranche_id","grant_id") REFERENCES "public"."grant_tranche"("id","grant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contribution_grantId_idx" ON "contribution" USING btree ("grant_id");--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_grant_project_check" CHECK ("contribution"."grant_id" IS NULL OR ("contribution"."programme_id" IS NOT NULL AND "contribution"."project_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_grant_tranche_check" CHECK ("contribution"."grant_tranche_id" IS NULL OR "contribution"."grant_id" IS NOT NULL);