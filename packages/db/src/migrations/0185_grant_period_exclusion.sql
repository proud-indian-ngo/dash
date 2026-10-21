-- A project's grants never overlap in time (inclusive dates). Drizzle can't
-- declare an exclusion constraint, so it lives in this custom migration.
-- btree_gist is a trusted extension, so the database owner can create it.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "grant_agreement" ADD CONSTRAINT "grant_agreement_project_period_excl" EXCLUDE USING gist ("project_id" WITH =, daterange("starts_on", "ends_on", '[]') WITH &&);
