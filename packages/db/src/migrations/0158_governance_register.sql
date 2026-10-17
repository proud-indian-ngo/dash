CREATE TYPE "public"."casting_vote_rule" AS ENUM('chair', 'co_founders', 'none');--> statement-breakpoint
CREATE TYPE "public"."governance_document_format" AS ENUM('pdf', 'signed_pdf', 'eml', 'scan');--> statement-breakpoint
CREATE TYPE "public"."governance_document_kind" AS ENUM('trust_deed', 'deed_amendment', 'registration_certificate', 'resolution', 'minutes', 'resignation', 'acceptance', 'policy', 'evidence', 'other');--> statement-breakpoint
CREATE TYPE "public"."quorum_kind" AS ENUM('fixed', 'fraction');--> statement-breakpoint
CREATE TYPE "public"."resolution_threshold" AS ENUM('majority_in_office', 'two_thirds_in_office', 'unanimous_others');--> statement-breakpoint
CREATE TYPE "public"."trustee_cessation_basis" AS ENUM('resignation', 'term_end', 'absence_4_23', 'death', 'removal_7_12');--> statement-breakpoint
CREATE TYPE "public"."trustee_office_kind" AS ENUM('managing_trustee', 'joint_managing_trustee', 'president', 'vice_president', 'secretary', 'treasurer');--> statement-breakpoint
CREATE TYPE "public"."trustee_term_basis" AS ENUM('deed_original', 'co_option_4_5', 'appointment_7_9', 'reappointment');--> statement-breakpoint
CREATE TABLE "deed_version" (
	"amendment_threshold" "resolution_threshold" DEFAULT 'two_thirds_in_office' NOT NULL,
	"casting_vote" "casting_vote_rule" NOT NULL,
	"circular_issuers" jsonb NOT NULL,
	"co_option_max_years" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	"document_id" uuid,
	"effective_from" date NOT NULL,
	"electronic_circulation" boolean NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"max_trustees" integer NOT NULL,
	"min_trustees" integer NOT NULL,
	"notice_days" integer NOT NULL,
	"number" integer NOT NULL,
	"quorum_floor" integer NOT NULL,
	"quorum_kind" "quorum_kind" NOT NULL,
	"quorum_required_office" "trustee_office_kind",
	"quorum_value" integer NOT NULL,
	"title" text NOT NULL,
	"video_counts_present" boolean NOT NULL,
	CONSTRAINT "deed_version_trustees_check" CHECK ("deed_version"."min_trustees" >= 1 AND "deed_version"."max_trustees" >= "deed_version"."min_trustees"),
	CONSTRAINT "deed_version_quorum_check" CHECK ("deed_version"."quorum_value" > 0 AND "deed_version"."quorum_floor" >= 0 AND ("deed_version"."quorum_kind" = 'fixed' OR "deed_version"."quorum_value" <= 100))
);
--> statement-breakpoint
CREATE TABLE "governance_document" (
	"content_type" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"dated_on" date NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "governance_document_kind" NOT NULL,
	"note" text,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"source_format" "governance_document_format" NOT NULL,
	"title" text NOT NULL,
	"uploaded_by" text,
	"validated_at" timestamp,
	"validation_report" jsonb
);
--> statement-breakpoint
CREATE TABLE "trustee" (
	"created_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"is_co_founder" boolean DEFAULT false NOT NULL,
	"legal_name" text NOT NULL,
	"updated_at" timestamp NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "trustee_office" (
	"created_at" timestamp NOT NULL,
	"ended_on" date,
	"end_evidence_document_id" uuid,
	"id" uuid PRIMARY KEY NOT NULL,
	"office" "trustee_office_kind" NOT NULL,
	"start_evidence_document_id" uuid,
	"starts_on" date NOT NULL,
	"trustee_id" uuid NOT NULL,
	"updated_at" timestamp NOT NULL,
	"validity_note" text,
	CONSTRAINT "trustee_office_dates_check" CHECK ("trustee_office"."ended_on" IS NULL OR "trustee_office"."ended_on" > "trustee_office"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "trustee_term" (
	"acceptance_document_id" uuid,
	"basis" "trustee_term_basis" NOT NULL,
	"cessation_basis" "trustee_cessation_basis",
	"created_at" timestamp NOT NULL,
	"ended_on" date,
	"end_evidence_document_id" uuid,
	"ends_on" date,
	"id" uuid PRIMARY KEY NOT NULL,
	"start_evidence_document_id" uuid,
	"starts_on" date NOT NULL,
	"trustee_id" uuid NOT NULL,
	"updated_at" timestamp NOT NULL,
	"validity_note" text,
	CONSTRAINT "trustee_term_dates_check" CHECK (("trustee_term"."ends_on" IS NULL OR "trustee_term"."ends_on" >= "trustee_term"."starts_on") AND ("trustee_term"."ended_on" IS NULL OR "trustee_term"."ended_on" > "trustee_term"."starts_on")),
	CONSTRAINT "trustee_term_cessation_check" CHECK (("trustee_term"."ended_on" IS NULL) = ("trustee_term"."cessation_basis" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "private"."trustee_private" (
	"address" text,
	"aadhaar_name" text,
	"aadhaar_last4" text,
	"aadhaar_reference_encrypted" text,
	"email" text,
	"pan_name" text,
	"pan_encrypted" text,
	"pan_last4" text,
	"phone" text,
	"trustee_id" uuid PRIMARY KEY NOT NULL,
	"updated_at" timestamp NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "organisation_registration" ADD COLUMN "certificate_document_id" uuid;--> statement-breakpoint
ALTER TABLE "deed_version" ADD CONSTRAINT "deed_version_document_id_governance_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."governance_document"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_document" ADD CONSTRAINT "governance_document_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trustee" ADD CONSTRAINT "trustee_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trustee_office" ADD CONSTRAINT "trustee_office_end_evidence_document_id_governance_document_id_fk" FOREIGN KEY ("end_evidence_document_id") REFERENCES "public"."governance_document"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trustee_office" ADD CONSTRAINT "trustee_office_start_evidence_document_id_governance_document_id_fk" FOREIGN KEY ("start_evidence_document_id") REFERENCES "public"."governance_document"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trustee_office" ADD CONSTRAINT "trustee_office_trustee_id_trustee_id_fk" FOREIGN KEY ("trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trustee_term" ADD CONSTRAINT "trustee_term_acceptance_document_id_governance_document_id_fk" FOREIGN KEY ("acceptance_document_id") REFERENCES "public"."governance_document"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trustee_term" ADD CONSTRAINT "trustee_term_end_evidence_document_id_governance_document_id_fk" FOREIGN KEY ("end_evidence_document_id") REFERENCES "public"."governance_document"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trustee_term" ADD CONSTRAINT "trustee_term_start_evidence_document_id_governance_document_id_fk" FOREIGN KEY ("start_evidence_document_id") REFERENCES "public"."governance_document"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trustee_term" ADD CONSTRAINT "trustee_term_trustee_id_trustee_id_fk" FOREIGN KEY ("trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."trustee_private" ADD CONSTRAINT "trustee_private_trustee_id_trustee_id_fk" FOREIGN KEY ("trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."trustee_private" ADD CONSTRAINT "trustee_private_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deed_version_number_uidx" ON "deed_version" USING btree ("number");--> statement-breakpoint
CREATE INDEX "governance_document_kind_idx" ON "governance_document" USING btree ("kind","dated_on");--> statement-breakpoint
CREATE UNIQUE INDEX "governance_document_object_key_uidx" ON "governance_document" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "trustee_user_uidx" ON "trustee" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trustee_office_trustee_idx" ON "trustee_office" USING btree ("trustee_id","starts_on");--> statement-breakpoint
CREATE INDEX "trustee_office_office_idx" ON "trustee_office" USING btree ("office","starts_on");--> statement-breakpoint
CREATE INDEX "trustee_term_trustee_idx" ON "trustee_term" USING btree ("trustee_id","starts_on");--> statement-breakpoint
ALTER TABLE "organisation_registration" ADD CONSTRAINT "organisation_registration_certificate_document_id_governance_document_id_fk" FOREIGN KEY ("certificate_document_id") REFERENCES "public"."governance_document"("id") ON DELETE set null ON UPDATE no action;