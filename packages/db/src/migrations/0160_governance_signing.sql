CREATE TYPE "private"."signing_job_kind" AS ENUM('enrol', 'sign');--> statement-breakpoint
CREATE TYPE "private"."signing_job_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "signing_certificate" (
	"chain" jsonb NOT NULL,
	"der" text NOT NULL,
	"enrolled_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"method" "signature_method" DEFAULT 'dsc_helper' NOT NULL,
	"not_after" timestamp NOT NULL,
	"not_before" timestamp NOT NULL,
	"revoked_at" timestamp,
	"serial" text NOT NULL,
	"sha256" text NOT NULL,
	"subject" text NOT NULL,
	"trustee_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private"."signing_job" (
	"based_on_sha256" text,
	"certificate_id" uuid,
	"completed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"error" text,
	"expires_at" timestamp NOT NULL,
	"field_name" text,
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "private"."signing_job_kind" NOT NULL,
	"resolution_id" uuid,
	"state_object_key" text,
	"status" "private"."signing_job_status" DEFAULT 'pending' NOT NULL,
	"to_sign" text,
	"token_hash" text NOT NULL,
	"trustee_id" uuid NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "governance_document" ADD COLUMN "archive_object_key" text;--> statement-breakpoint
ALTER TABLE "governance_document" ADD COLUMN "archive_sha256" text;--> statement-breakpoint
ALTER TABLE "governance_document" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "governance_document" ADD COLUMN "archive_renew_on" date;--> statement-breakpoint
ALTER TABLE "signing_certificate" ADD CONSTRAINT "signing_certificate_trustee_id_trustee_id_fk" FOREIGN KEY ("trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."signing_job" ADD CONSTRAINT "signing_job_certificate_id_signing_certificate_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."signing_certificate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."signing_job" ADD CONSTRAINT "signing_job_resolution_id_resolution_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."signing_job" ADD CONSTRAINT "signing_job_trustee_id_trustee_id_fk" FOREIGN KEY ("trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."signing_job" ADD CONSTRAINT "signing_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signing_certificate_trustee_sha_uidx" ON "signing_certificate" USING btree ("trustee_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "signing_job_token_uidx" ON "private"."signing_job" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "signing_job_user_idx" ON "private"."signing_job" USING btree ("user_id","created_at");