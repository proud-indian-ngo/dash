CREATE TYPE "public"."import_batch_source" AS ENUM('give_do_csv', 'generic_csv');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('draft', 'reviewed', 'importing', 'completed', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "private"."external_identity_entity_type" AS ENUM('payment');--> statement-breakpoint
CREATE TYPE "private"."external_identity_provider" AS ENUM('give_do', 'generic');--> statement-breakpoint
CREATE TYPE "private"."import_row_outcome" AS ENUM('pending', 'imported', 'linked_existing', 'conflict', 'skipped', 'error');--> statement-breakpoint
CREATE TYPE "private"."processing_basis" AS ENUM('consent', 'voluntary_provision_7a', 'legal_disclosure_7d');--> statement-breakpoint
CREATE TABLE "import_batch" (
	"completed_at" timestamp,
	"conflict_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"default_channel" text NOT NULL,
	"date_format" text,
	"error_count" integer DEFAULT 0 NOT NULL,
	"file_hash" text NOT NULL,
	"file_name" text NOT NULL,
	"fund_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"linked_count" integer DEFAULT 0 NOT NULL,
	"mapping" jsonb,
	"new_donor_count" integer DEFAULT 0 NOT NULL,
	"org_account_id" uuid NOT NULL,
	"parser_version" integer NOT NULL,
	"programme_id" uuid,
	"project_id" uuid,
	"row_count" integer NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"source" "import_batch_source" NOT NULL,
	"status" "import_batch_status" DEFAULT 'draft' NOT NULL,
	"updated_at" timestamp NOT NULL,
	"uploaded_by" text
);
--> statement-breakpoint
CREATE TABLE "private"."collection_event" (
	"channel" text NOT NULL,
	"created_by" text,
	"evidence_note" text,
	"id" uuid PRIMARY KEY NOT NULL,
	"import_batch_id" uuid,
	"notice_version" text,
	"occurred_at" timestamp NOT NULL,
	"party_id" uuid NOT NULL,
	"processing_basis" "private"."processing_basis" NOT NULL,
	"purpose" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private"."external_identity" (
	"contribution_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"entity_type" "private"."external_identity_entity_type" NOT NULL,
	"external_id" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"payload_hash" text NOT NULL,
	"provider" "private"."external_identity_provider" NOT NULL,
	"provider_account" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private"."import_row" (
	"batch_id" uuid NOT NULL,
	"contribution_id" uuid,
	"created_at" timestamp NOT NULL,
	"decided_at" timestamp,
	"decided_by" text,
	"external_identity_id" uuid,
	"id" uuid PRIMARY KEY NOT NULL,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"outcome" "private"."import_row_outcome" DEFAULT 'pending' NOT NULL,
	"outcome_reason" text,
	"parse_issue" text,
	"party_id" uuid,
	"raw" jsonb,
	"raw_hash" text NOT NULL,
	"retain_until" date NOT NULL,
	"retention_basis" text NOT NULL,
	"retention_policy_version" text NOT NULL,
	"row_number" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contribution" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_fund_id_fund_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."fund"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_org_account_id_org_account_id_fk" FOREIGN KEY ("org_account_id") REFERENCES "public"."org_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_programme_id_programme_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programme"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."collection_event" ADD CONSTRAINT "collection_event_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."collection_event" ADD CONSTRAINT "collection_event_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."collection_event" ADD CONSTRAINT "collection_event_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."external_identity" ADD CONSTRAINT "external_identity_contribution_id_contribution_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contribution"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."import_row" ADD CONSTRAINT "import_row_batch_id_import_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."import_row" ADD CONSTRAINT "import_row_contribution_id_contribution_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contribution"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."import_row" ADD CONSTRAINT "import_row_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."import_row" ADD CONSTRAINT "import_row_external_identity_id_external_identity_id_fk" FOREIGN KEY ("external_identity_id") REFERENCES "private"."external_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."import_row" ADD CONSTRAINT "import_row_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batch_createdAt_idx" ON "import_batch" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "import_batch_source_idx" ON "import_batch" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_event_party_batch_uidx" ON "private"."collection_event" USING btree ("party_id","import_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_identity_key_uidx" ON "private"."external_identity" USING btree ("provider","provider_account","entity_type","external_id");--> statement-breakpoint
CREATE INDEX "external_identity_contributionId_idx" ON "private"."external_identity" USING btree ("contribution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_row_batch_row_uidx" ON "private"."import_row" USING btree ("batch_id","row_number");--> statement-breakpoint
CREATE INDEX "import_row_retainUntil_idx" ON "private"."import_row" USING btree ("retain_until");--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contribution_importBatchId_idx" ON "contribution" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "contribution_reference_lower_idx" ON "contribution" USING btree (lower("reference"));--> statement-breakpoint
CREATE INDEX "party_private_email_lower_idx" ON "private"."party_private" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "party_private_phone_digits_idx" ON "private"."party_private" USING btree (regexp_replace(coalesce("phone", ''), '\D', '', 'g'));