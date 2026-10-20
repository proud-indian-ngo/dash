CREATE TABLE "circular" (
	"created_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"issued_at" timestamp NOT NULL,
	"issued_by_trustee_id" uuid NOT NULL,
	"response_due_on" date NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circular_revision" (
	"circular_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"fields_prepared" boolean DEFAULT true NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"latest_object_key" text NOT NULL,
	"latest_sha256" text NOT NULL,
	"object_key" text NOT NULL,
	"revision" integer NOT NULL,
	"sha256" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circular_signature" (
	"answers" text,
	"certificate_sha256" text,
	"circular_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text,
	"field_name" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"issuer" text,
	"method" "signature_method" NOT NULL,
	"object_key" text NOT NULL,
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
ALTER TABLE "resolution" DROP CONSTRAINT "resolution_issued_by_trustee_id_trustee_id_fk";
--> statement-breakpoint
ALTER TABLE "resolution_response" DROP CONSTRAINT "resolution_response_signature_id_resolution_signature_id_fk";
--> statement-breakpoint
ALTER TABLE "private"."signing_job" DROP CONSTRAINT "signing_job_resolution_id_resolution_id_fk";
--> statement-breakpoint
DROP INDEX "resolution_status_idx";--> statement-breakpoint
ALTER TABLE "resolution" ADD COLUMN "circular_id" uuid;--> statement-breakpoint
ALTER TABLE "resolution" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "private"."signing_job" ADD COLUMN "circular_id" uuid;--> statement-breakpoint
-- Backfill: every resolution issued before circulars existed becomes a
-- circular of one, keeping its ID, so its revision, signatures, responses
-- and signing jobs carry over unchanged. Revisions and signatures keep
-- their IDs too, so resolution_response.signature_id stays valid. The
-- revision's text is dropped: issue copied it from the resolution, whose
-- text can't change after that. The guard aborts the migration (and with
-- it the deploy) rather than lose an issuer, a due date or issued text.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "resolution"
    WHERE "issued_at" IS NOT NULL
      AND ("issued_by_trustee_id" IS NULL OR "response_due_on" IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM "resolution_revision" rr
    JOIN "resolution" r ON r."id" = rr."resolution_id"
    WHERE r."issued_at" IS NULL OR rr."body" <> r."body"
  ) THEN
    RAISE EXCEPTION 'governance_circulars: an issued resolution lacks an issuer or due date, or its revision text differs; fix it before migrating';
  END IF;
END $$;--> statement-breakpoint
INSERT INTO "circular" ("created_at", "id", "issued_at", "issued_by_trustee_id", "response_due_on", "updated_at")
SELECT "issued_at", "id", "issued_at", "issued_by_trustee_id", "response_due_on", "updated_at"
FROM "resolution" WHERE "issued_at" IS NOT NULL;--> statement-breakpoint
UPDATE "resolution" SET "circular_id" = "id", "position" = 1 WHERE "issued_at" IS NOT NULL;--> statement-breakpoint
-- These PDFs have no answers fields, so they count as issued without
-- fields: a signer's copy is the latest PDF as it stands (their empty
-- signature field is still there for the helper or Acrobat).
INSERT INTO "circular_revision" ("circular_id", "created_at", "fields_prepared", "id", "latest_object_key", "latest_sha256", "object_key", "revision", "sha256")
SELECT "resolution_id", "created_at", false, "id", "latest_object_key", "latest_sha256", "object_key", "revision", "sha256"
FROM "resolution_revision";--> statement-breakpoint
-- No answers field was filled before these signatures, so answers stay null.
INSERT INTO "circular_signature" ("certificate_sha256", "circular_id", "created_at", "created_by", "field_name", "id", "issuer", "method", "object_key", "revision_id", "serial", "sha256", "signer_name", "signing_time", "timestamped", "trustee_id", "trusted")
SELECT "certificate_sha256", "resolution_id", "created_at", "created_by", "field_name", "id", "issuer", "method", "object_key", "revision_id", "serial", "sha256", "signer_name", "signing_time", "timestamped", "trustee_id", "trusted"
FROM "resolution_signature";--> statement-breakpoint
-- A signing job follows its resolution to the circular; a pending one can
-- still finish, as its base PDF is the circular's latest. A signing job
-- without an issued resolution has nothing to sign and is dropped.
UPDATE "private"."signing_job" j SET "circular_id" = j."resolution_id"
FROM "circular" c WHERE c."id" = j."resolution_id";--> statement-breakpoint
DELETE FROM "private"."signing_job" WHERE "kind" = 'sign' AND "circular_id" IS NULL;--> statement-breakpoint
ALTER TABLE "circular" ADD CONSTRAINT "circular_issued_by_trustee_id_trustee_id_fk" FOREIGN KEY ("issued_by_trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circular_revision" ADD CONSTRAINT "circular_revision_circular_id_circular_id_fk" FOREIGN KEY ("circular_id") REFERENCES "public"."circular"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circular_signature" ADD CONSTRAINT "circular_signature_circular_id_circular_id_fk" FOREIGN KEY ("circular_id") REFERENCES "public"."circular"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circular_signature" ADD CONSTRAINT "circular_signature_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circular_signature" ADD CONSTRAINT "circular_signature_revision_id_circular_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."circular_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circular_signature" ADD CONSTRAINT "circular_signature_trustee_id_trustee_id_fk" FOREIGN KEY ("trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "circular_revision_uidx" ON "circular_revision" USING btree ("circular_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "circular_signature_field_uidx" ON "circular_signature" USING btree ("revision_id","field_name");--> statement-breakpoint
CREATE INDEX "circular_signature_circular_idx" ON "circular_signature" USING btree ("circular_id","trustee_id");--> statement-breakpoint
ALTER TABLE "resolution" ADD CONSTRAINT "resolution_circular_id_circular_id_fk" FOREIGN KEY ("circular_id") REFERENCES "public"."circular"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_response" ADD CONSTRAINT "resolution_response_signature_id_circular_signature_id_fk" FOREIGN KEY ("signature_id") REFERENCES "public"."circular_signature"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."signing_job" ADD CONSTRAINT "signing_job_circular_id_circular_id_fk" FOREIGN KEY ("circular_id") REFERENCES "public"."circular"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resolution_circular_position_uidx" ON "resolution" USING btree ("circular_id","position");--> statement-breakpoint
CREATE INDEX "resolution_status_idx" ON "resolution" USING btree ("status");--> statement-breakpoint
-- The Zero publication lists resolution's columns, and a listed column
-- can't be dropped. The migrator's publication step adds the table back
-- with its new columns once migrations finish.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'pi_dash_public' AND schemaname = 'public' AND tablename = 'resolution'
  ) THEN
    ALTER PUBLICATION "pi_dash_public" DROP TABLE "public"."resolution";
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "resolution" DROP COLUMN "issued_at";--> statement-breakpoint
ALTER TABLE "resolution" DROP COLUMN "issued_by_trustee_id";--> statement-breakpoint
ALTER TABLE "resolution" DROP COLUMN "response_due_on";--> statement-breakpoint
ALTER TABLE "private"."signing_job" DROP COLUMN "resolution_id";