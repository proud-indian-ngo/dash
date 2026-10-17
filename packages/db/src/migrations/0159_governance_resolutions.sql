CREATE TYPE "public"."resolution_kind" AS ENUM('circular', 'meeting');--> statement-breakpoint
CREATE TYPE "public"."resolution_response_kind" AS ENUM('pending', 'assent', 'objection');--> statement-breakpoint
CREATE TYPE "public"."resolution_status" AS ENUM('draft', 'issued', 'passed', 'failed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."resolution_template_key" AS ENUM('ordinary', 'appointment', 'cessation', 'office_bearer', 'bank_operation', 'registered_office', 'deed_amendment', 'removal');--> statement-breakpoint
CREATE TYPE "public"."signature_method" AS ENUM('dsc_helper', 'acrobat_upload', 'esign', 'ink_historical');--> statement-breakpoint
CREATE TABLE "resolution" (
	"amends_resolution_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"decided_at" timestamp,
	"deed_version_id" uuid,
	"drafted_by" text,
	"effect" jsonb NOT NULL,
	"final_document_id" uuid,
	"fiscal_year" text,
	"historical" boolean DEFAULT false NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"issued_at" timestamp,
	"issued_by_trustee_id" uuid,
	"kind" "resolution_kind" DEFAULT 'circular' NOT NULL,
	"number" text,
	"outcome_note" text,
	"decided_on" date,
	"rescinds_resolution_id" uuid,
	"response_due_on" date,
	"sequence" integer,
	"status" "resolution_status" DEFAULT 'draft' NOT NULL,
	"template_key" "resolution_template_key" NOT NULL,
	"threshold" "resolution_threshold",
	"title" text NOT NULL,
	"updated_at" timestamp NOT NULL,
	"validity_note" text,
	CONSTRAINT "resolution_number_check" CHECK (("resolution"."number" IS NULL) = ("resolution"."sequence" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "resolution_response" (
	"conflict_declared" boolean DEFAULT false NOT NULL,
	"conflict_note" text,
	"field_name" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"reason" text,
	"resolution_id" uuid NOT NULL,
	"responded_at" timestamp,
	"response" "resolution_response_kind" DEFAULT 'pending' NOT NULL,
	"signature_id" uuid,
	"trustee_id" uuid NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "resolution_revision" (
	"body" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"fields_prepared" boolean DEFAULT true NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"latest_object_key" text NOT NULL,
	"latest_sha256" text NOT NULL,
	"object_key" text NOT NULL,
	"resolution_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"sha256" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resolution_signature" (
	"certificate_sha256" text,
	"created_at" timestamp NOT NULL,
	"created_by" text,
	"field_name" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"issuer" text,
	"method" "signature_method" NOT NULL,
	"object_key" text NOT NULL,
	"resolution_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"serial" text,
	"sha256" text NOT NULL,
	"signer_name" text,
	"signing_time" timestamp,
	"timestamped" boolean DEFAULT false NOT NULL,
	"trustee_id" uuid NOT NULL,
	"trusted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trustee_office" ADD COLUMN "source_resolution_id" uuid;--> statement-breakpoint
ALTER TABLE "trustee_term" ADD COLUMN "source_resolution_id" uuid;--> statement-breakpoint
ALTER TABLE "resolution" ADD CONSTRAINT "resolution_amends_resolution_id_resolution_id_fk" FOREIGN KEY ("amends_resolution_id") REFERENCES "public"."resolution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution" ADD CONSTRAINT "resolution_deed_version_id_deed_version_id_fk" FOREIGN KEY ("deed_version_id") REFERENCES "public"."deed_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution" ADD CONSTRAINT "resolution_drafted_by_user_id_fk" FOREIGN KEY ("drafted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution" ADD CONSTRAINT "resolution_final_document_id_governance_document_id_fk" FOREIGN KEY ("final_document_id") REFERENCES "public"."governance_document"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution" ADD CONSTRAINT "resolution_issued_by_trustee_id_trustee_id_fk" FOREIGN KEY ("issued_by_trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution" ADD CONSTRAINT "resolution_rescinds_resolution_id_resolution_id_fk" FOREIGN KEY ("rescinds_resolution_id") REFERENCES "public"."resolution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_response" ADD CONSTRAINT "resolution_response_resolution_id_resolution_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_response" ADD CONSTRAINT "resolution_response_signature_id_resolution_signature_id_fk" FOREIGN KEY ("signature_id") REFERENCES "public"."resolution_signature"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_response" ADD CONSTRAINT "resolution_response_trustee_id_trustee_id_fk" FOREIGN KEY ("trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_response" ADD CONSTRAINT "resolution_response_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_revision" ADD CONSTRAINT "resolution_revision_resolution_id_resolution_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_signature" ADD CONSTRAINT "resolution_signature_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_signature" ADD CONSTRAINT "resolution_signature_resolution_id_resolution_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_signature" ADD CONSTRAINT "resolution_signature_revision_id_resolution_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."resolution_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_signature" ADD CONSTRAINT "resolution_signature_trustee_id_trustee_id_fk" FOREIGN KEY ("trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resolution_number_uidx" ON "resolution" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "resolution_fy_sequence_uidx" ON "resolution" USING btree ("fiscal_year","sequence");--> statement-breakpoint
CREATE INDEX "resolution_status_idx" ON "resolution" USING btree ("status","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "resolution_response_uidx" ON "resolution_response" USING btree ("resolution_id","trustee_id");--> statement-breakpoint
CREATE INDEX "resolution_response_user_idx" ON "resolution_response" USING btree ("user_id","response");--> statement-breakpoint
CREATE UNIQUE INDEX "resolution_revision_uidx" ON "resolution_revision" USING btree ("resolution_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "resolution_signature_field_uidx" ON "resolution_signature" USING btree ("revision_id","field_name");--> statement-breakpoint
ALTER TABLE "trustee_office" ADD CONSTRAINT "trustee_office_source_resolution_id_resolution_id_fk" FOREIGN KEY ("source_resolution_id") REFERENCES "public"."resolution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trustee_term" ADD CONSTRAINT "trustee_term_source_resolution_id_resolution_id_fk" FOREIGN KEY ("source_resolution_id") REFERENCES "public"."resolution"("id") ON DELETE restrict ON UPDATE no action;