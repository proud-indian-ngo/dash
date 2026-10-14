CREATE TYPE "public"."contribution_refund_source" AS ENUM('razorpay', 'manual');--> statement-breakpoint
ALTER TYPE "private"."external_identity_entity_type" ADD VALUE 'refund';--> statement-breakpoint
CREATE TABLE "contribution_refund" (
	"amount_paise" bigint NOT NULL,
	"amount_changed" boolean DEFAULT false NOT NULL,
	"contribution_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"reference" text,
	"refund_after_receipt" boolean DEFAULT false NOT NULL,
	"refunded_on" date NOT NULL,
	"source" "contribution_refund_source" NOT NULL,
	CONSTRAINT "contribution_refund_amount_positive" CHECK ("contribution_refund"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "private"."pending_refund" (
	"amount_paise" bigint NOT NULL,
	"created_at" timestamp NOT NULL,
	"currency" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"provider" "private"."external_identity_provider" NOT NULL,
	"provider_account" text NOT NULL,
	"refunded_at" timestamp NOT NULL,
	"refund_id" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "private"."import_row" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "contribution_refund" ADD CONSTRAINT "contribution_refund_contribution_id_contribution_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contribution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contribution_refund_contributionId_idx" ON "contribution_refund" USING btree ("contribution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contribution_refund_source_reference_uidx" ON "contribution_refund" USING btree ("source","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_refund_key_uidx" ON "private"."pending_refund" USING btree ("provider","provider_account","refund_id");--> statement-breakpoint
CREATE INDEX "pending_refund_payment_idx" ON "private"."pending_refund" USING btree ("provider","provider_account","payment_id");--> statement-breakpoint
CREATE INDEX "import_row_externalId_idx" ON "private"."import_row" USING btree ("external_id");