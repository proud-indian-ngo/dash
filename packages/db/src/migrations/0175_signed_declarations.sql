CREATE TYPE "public"."conflict_declaration_status" AS ENUM('awaiting_signature', 'signed', 'confirmed');--> statement-breakpoint
ALTER TABLE "private"."signing_job" DROP CONSTRAINT "signing_job_target_check";--> statement-breakpoint
DROP INDEX "conflict_declaration_trustee_year_uidx";--> statement-breakpoint
ALTER TABLE "conflict_declaration" ADD COLUMN "object_key" text;--> statement-breakpoint
ALTER TABLE "conflict_declaration" ADD COLUMN "sha256" text;--> statement-breakpoint
-- Declarations made before signatures were required were confirmed by a click; they stay in force.
ALTER TABLE "conflict_declaration" ADD COLUMN "status" "conflict_declaration_status" DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "conflict_declaration" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "private"."signing_job" ADD COLUMN "declaration_id" uuid;--> statement-breakpoint
ALTER TABLE "private"."signing_job" ADD CONSTRAINT "signing_job_declaration_id_conflict_declaration_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."conflict_declaration"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conflict_declaration_trustee_year_idx" ON "conflict_declaration" USING btree ("trustee_id","fiscal_year");--> statement-breakpoint
CREATE UNIQUE INDEX "conflict_declaration_awaiting_uidx" ON "conflict_declaration" USING btree ("trustee_id","fiscal_year") WHERE "conflict_declaration"."status" = 'awaiting_signature';--> statement-breakpoint
ALTER TABLE "private"."signing_job" ADD CONSTRAINT "signing_job_target_check" CHECK ("private"."signing_job"."kind" = 'enrol' OR num_nonnulls("private"."signing_job"."circular_id", "private"."signing_job"."meeting_id", "private"."signing_job"."declaration_id") = 1);