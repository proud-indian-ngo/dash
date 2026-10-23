CREATE TYPE "public"."utilisation_certificate_status" AS ENUM('awaiting_head', 'awaiting_finance', 'awaiting_ca', 'final', 'cancelled', 'discarded');--> statement-breakpoint
CREATE TABLE "utilisation_certificate" (
	"ca_udin" text,
	"ca_filename" text,
	"ca_object_key" text,
	"ca_recorded_at" timestamp,
	"ca_recorded_by" text,
	"ca_required" boolean NOT NULL,
	"cancel_reason" text,
	"cancelled_at" timestamp,
	"cancelled_by" text,
	"created_at" timestamp NOT NULL,
	"finance_signed_at" timestamp,
	"finance_trustee_id" uuid NOT NULL,
	"fiscal_year" text NOT NULL,
	"from_on" date NOT NULL,
	"grant_id" uuid NOT NULL,
	"head_signed_at" timestamp,
	"head_trustee_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"interest_paise" bigint NOT NULL,
	"latest_object_key" text NOT NULL,
	"latest_sha256" text NOT NULL,
	"number" text NOT NULL,
	"prepared_by" text,
	"sequence" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" "utilisation_certificate_status" NOT NULL,
	"to_on" date NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "utilisation_certificate_number_unique" UNIQUE("number"),
	CONSTRAINT "utilisation_certificate_sequence_unique" UNIQUE("fiscal_year","sequence"),
	CONSTRAINT "utilisation_certificate_period_check" CHECK ("utilisation_certificate"."to_on" >= "utilisation_certificate"."from_on"),
	CONSTRAINT "utilisation_certificate_interest_check" CHECK ("utilisation_certificate"."interest_paise" >= 0),
	CONSTRAINT "utilisation_certificate_signers_check" CHECK ("utilisation_certificate"."head_trustee_id" <> "utilisation_certificate"."finance_trustee_id")
);
--> statement-breakpoint
CREATE TABLE "private"."utilisation_certificate_counter" (
	"fiscal_year" text PRIMARY KEY NOT NULL,
	"last_sequence" integer NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "private"."signing_job" DROP CONSTRAINT "signing_job_target_check";--> statement-breakpoint
ALTER TABLE "grant_agreement" ADD COLUMN "needs_ca_certificate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "private"."signing_job" ADD COLUMN "utilisation_certificate_id" uuid;--> statement-breakpoint
ALTER TABLE "utilisation_certificate" ADD CONSTRAINT "utilisation_certificate_ca_recorded_by_user_id_fk" FOREIGN KEY ("ca_recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisation_certificate" ADD CONSTRAINT "utilisation_certificate_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisation_certificate" ADD CONSTRAINT "utilisation_certificate_finance_trustee_id_trustee_id_fk" FOREIGN KEY ("finance_trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisation_certificate" ADD CONSTRAINT "utilisation_certificate_grant_id_grant_agreement_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grant_agreement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisation_certificate" ADD CONSTRAINT "utilisation_certificate_head_trustee_id_trustee_id_fk" FOREIGN KEY ("head_trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisation_certificate" ADD CONSTRAINT "utilisation_certificate_prepared_by_user_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "utilisation_certificate_grantId_idx" ON "utilisation_certificate" USING btree ("grant_id");--> statement-breakpoint
ALTER TABLE "private"."signing_job" ADD CONSTRAINT "signing_job_utilisation_certificate_fk" FOREIGN KEY ("utilisation_certificate_id") REFERENCES "public"."utilisation_certificate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."signing_job" ADD CONSTRAINT "signing_job_target_check" CHECK ("private"."signing_job"."kind" = 'enrol' OR num_nonnulls("private"."signing_job"."circular_id", "private"."signing_job"."meeting_id", "private"."signing_job"."declaration_id", "private"."signing_job"."utilisation_certificate_id") = 1);