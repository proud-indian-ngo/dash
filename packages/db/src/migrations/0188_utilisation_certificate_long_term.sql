ALTER TYPE "public"."governance_document_kind" ADD VALUE 'utilisation_certificate' BEFORE 'evidence';--> statement-breakpoint
ALTER TABLE "utilisation_certificate" ADD COLUMN "archive_object_key" text;--> statement-breakpoint
ALTER TABLE "utilisation_certificate" ADD COLUMN "archive_sha256" text;--> statement-breakpoint
ALTER TABLE "utilisation_certificate" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "utilisation_certificate" ADD COLUMN "archive_renew_on" date;--> statement-breakpoint
ALTER TABLE "utilisation_certificate" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "utilisation_certificate" ADD CONSTRAINT "utilisation_certificate_document_id_governance_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."governance_document"("id") ON DELETE restrict ON UPDATE no action;