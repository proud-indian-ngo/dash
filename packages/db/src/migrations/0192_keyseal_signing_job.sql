CREATE TYPE "private"."signing_job_state" AS ENUM('pending', 'claimed', 'prepared', 'completed', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "private"."signing_job" (
	"certificate" text,
	"certificate_policy" jsonb,
	"chain" jsonb,
	"claim_nonce_hash" text,
	"created_at" timestamp NOT NULL,
	"digest_algorithm" text,
	"documents" jsonb NOT NULL,
	"error" text,
	"expected_certificate_sha256" text,
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "private"."signing_job_kind" NOT NULL,
	"lease_started_at" timestamp,
	"reference" text,
	"rsa_padding" text NOT NULL,
	"signer" text NOT NULL,
	"state" "private"."signing_job_state" NOT NULL,
	"state_key" text,
	"title" text NOT NULL,
	"token_hash" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "signing_job_token_uidx" ON "private"."signing_job" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "signing_job_open_idx" ON "private"."signing_job" USING btree ("created_at") WHERE "private"."signing_job"."state" in ('pending', 'claimed', 'prepared');