CREATE TYPE "public"."gateway_settlement_item_type" AS ENUM('payment', 'refund', 'transfer', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."gateway_settlement_provider" AS ENUM('razorpay');--> statement-breakpoint
CREATE TYPE "public"."gateway_settlement_status" AS ENUM('created', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "gateway_settlement" (
	"amount_paise" bigint NOT NULL,
	"amount_changed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"external_id" text NOT NULL,
	"fees_paise" bigint DEFAULT 0 NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"org_account_id" uuid,
	"provider" "gateway_settlement_provider" NOT NULL,
	"provider_account" text NOT NULL,
	"settled_on" date NOT NULL,
	"status" "gateway_settlement_status" NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp NOT NULL,
	"utr" text,
	CONSTRAINT "gateway_settlement_amounts_nonnegative" CHECK ("gateway_settlement"."amount_paise" >= 0 AND "gateway_settlement"."fees_paise" >= 0 AND "gateway_settlement"."tax_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "gateway_settlement_item" (
	"contribution_id" uuid,
	"contribution_refund_id" uuid,
	"credit_paise" bigint DEFAULT 0 NOT NULL,
	"debit_paise" bigint DEFAULT 0 NOT NULL,
	"external_id" text NOT NULL,
	"fee_paise" bigint DEFAULT 0 NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"settled_at" timestamp NOT NULL,
	"settlement_id" uuid NOT NULL,
	"tax_paise" bigint DEFAULT 0 NOT NULL,
	"type" "gateway_settlement_item_type" NOT NULL,
	CONSTRAINT "gateway_settlement_item_amounts_nonnegative" CHECK ("gateway_settlement_item"."credit_paise" >= 0 AND "gateway_settlement_item"."debit_paise" >= 0 AND "gateway_settlement_item"."fee_paise" >= 0 AND "gateway_settlement_item"."tax_paise" >= 0)
);
--> statement-breakpoint
ALTER TABLE "gateway_settlement" ADD CONSTRAINT "gateway_settlement_org_account_id_org_account_id_fk" FOREIGN KEY ("org_account_id") REFERENCES "public"."org_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_settlement_item" ADD CONSTRAINT "gateway_settlement_item_contribution_id_contribution_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contribution"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_settlement_item" ADD CONSTRAINT "gateway_settlement_item_contribution_refund_id_contribution_refund_id_fk" FOREIGN KEY ("contribution_refund_id") REFERENCES "public"."contribution_refund"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_settlement_item" ADD CONSTRAINT "gateway_settlement_item_settlement_id_gateway_settlement_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."gateway_settlement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_settlement_key_uidx" ON "gateway_settlement" USING btree ("provider","provider_account","external_id");--> statement-breakpoint
CREATE INDEX "gateway_settlement_settledOn_idx" ON "gateway_settlement" USING btree ("settled_on");--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_settlement_item_key_uidx" ON "gateway_settlement_item" USING btree ("settlement_id","type","external_id");--> statement-breakpoint
CREATE INDEX "gateway_settlement_item_type_externalId_idx" ON "gateway_settlement_item" USING btree ("type","external_id");--> statement-breakpoint
CREATE INDEX "gateway_settlement_item_contributionId_idx" ON "gateway_settlement_item" USING btree ("contribution_id");--> statement-breakpoint
CREATE INDEX "gateway_settlement_item_contributionRefundId_idx" ON "gateway_settlement_item" USING btree ("contribution_refund_id");