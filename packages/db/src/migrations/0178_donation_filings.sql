CREATE TYPE "private"."donation_certificate_email_failure" AS ENUM('no_email', 'suppressed', 'not_configured', 'failed');--> statement-breakpoint
CREATE TYPE "private"."donation_certificate_match" AS ENUM('pre_arn', 'details');--> statement-breakpoint
CREATE TYPE "private"."donation_filing_status" AS ENUM('prepared', 'submitted', 'discarded');--> statement-breakpoint
CREATE TABLE "private"."donation_certificate" (
	"acknowledgement_number" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text,
	"emailed_at" timestamp,
	"email_failure" "private"."donation_certificate_email_failure",
	"email_queued_at" timestamp,
	"email_request_id" uuid,
	"file_name" text NOT NULL,
	"file_object_key" text NOT NULL,
	"file_sha256" text NOT NULL,
	"filing_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"matched_by" "private"."donation_certificate_match" NOT NULL,
	"row_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private"."donation_filing" (
	"acknowledgement_number" text,
	"created_at" timestamp NOT NULL,
	"created_by" text,
	"discarded_at" timestamp,
	"discarded_by" text,
	"file_name" text NOT NULL,
	"file_object_key" text NOT NULL,
	"file_sha256" text NOT NULL,
	"filed_on" date,
	"fiscal_year" text NOT NULL,
	"gift_count" integer NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"row_count" integer NOT NULL,
	"sequence" integer NOT NULL,
	"status" "private"."donation_filing_status" DEFAULT 'prepared' NOT NULL,
	"submitted_at" timestamp,
	"submitted_by" text,
	"total_paise" bigint NOT NULL,
	"transaction_id" text,
	CONSTRAINT "donation_filing_submitted_fields" CHECK (("private"."donation_filing"."status" = 'submitted') = ("private"."donation_filing"."filed_on" IS NOT NULL AND "private"."donation_filing"."acknowledgement_number" IS NOT NULL AND "private"."donation_filing"."transaction_id" IS NOT NULL)),
	CONSTRAINT "donation_filing_discarded_fields" CHECK (("private"."donation_filing"."status" = 'discarded') = ("private"."donation_filing"."discarded_at" IS NOT NULL)),
	CONSTRAINT "donation_filing_sequence_positive" CHECK ("private"."donation_filing"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "private"."donation_filing_gift" (
	"contribution_id" uuid PRIMARY KEY NOT NULL,
	"filing_id" uuid NOT NULL,
	"row_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private"."donation_filing_row" (
	"address" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"created_at" timestamp NOT NULL,
	"donation_type_code" text NOT NULL,
	"filing_id" uuid NOT NULL,
	"gift_count" integer NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"id_code" text NOT NULL,
	"id_number_encrypted" text NOT NULL,
	"id_number_last4" text,
	"id_type" "private"."party_id_type" NOT NULL,
	"mode_code" text NOT NULL,
	"name" text NOT NULL,
	"party_id" uuid NOT NULL,
	"pre_arn" text NOT NULL,
	"sr_no" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "private"."donation_certificate" ADD CONSTRAINT "donation_certificate_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."donation_certificate" ADD CONSTRAINT "donation_certificate_filing_id_donation_filing_id_fk" FOREIGN KEY ("filing_id") REFERENCES "private"."donation_filing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."donation_certificate" ADD CONSTRAINT "donation_certificate_row_id_donation_filing_row_id_fk" FOREIGN KEY ("row_id") REFERENCES "private"."donation_filing_row"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."donation_filing" ADD CONSTRAINT "donation_filing_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."donation_filing" ADD CONSTRAINT "donation_filing_discarded_by_user_id_fk" FOREIGN KEY ("discarded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."donation_filing" ADD CONSTRAINT "donation_filing_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."donation_filing_gift" ADD CONSTRAINT "donation_filing_gift_contribution_id_contribution_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contribution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."donation_filing_gift" ADD CONSTRAINT "donation_filing_gift_filing_id_donation_filing_id_fk" FOREIGN KEY ("filing_id") REFERENCES "private"."donation_filing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."donation_filing_gift" ADD CONSTRAINT "donation_filing_gift_row_id_donation_filing_row_id_fk" FOREIGN KEY ("row_id") REFERENCES "private"."donation_filing_row"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."donation_filing_row" ADD CONSTRAINT "donation_filing_row_filing_id_donation_filing_id_fk" FOREIGN KEY ("filing_id") REFERENCES "private"."donation_filing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."donation_filing_row" ADD CONSTRAINT "donation_filing_row_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "donation_certificate_row_uidx" ON "private"."donation_certificate" USING btree ("row_id");--> statement-breakpoint
CREATE UNIQUE INDEX "donation_certificate_ack_uidx" ON "private"."donation_certificate" USING btree ("acknowledgement_number");--> statement-breakpoint
CREATE UNIQUE INDEX "donation_certificate_object_key_uidx" ON "private"."donation_certificate" USING btree ("file_object_key");--> statement-breakpoint
CREATE INDEX "donation_certificate_filingId_idx" ON "private"."donation_certificate" USING btree ("filing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "donation_filing_fy_sequence_uidx" ON "private"."donation_filing" USING btree ("fiscal_year","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "donation_filing_object_key_uidx" ON "private"."donation_filing" USING btree ("file_object_key");--> statement-breakpoint
CREATE INDEX "donation_filing_gift_rowId_idx" ON "private"."donation_filing_gift" USING btree ("row_id");--> statement-breakpoint
CREATE UNIQUE INDEX "donation_filing_row_pre_arn_uidx" ON "private"."donation_filing_row" USING btree ("pre_arn");--> statement-breakpoint
CREATE UNIQUE INDEX "donation_filing_row_filing_sr_uidx" ON "private"."donation_filing_row" USING btree ("filing_id","sr_no");--> statement-breakpoint
CREATE INDEX "donation_filing_row_partyId_idx" ON "private"."donation_filing_row" USING btree ("party_id");