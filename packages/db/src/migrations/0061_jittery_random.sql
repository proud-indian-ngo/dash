CREATE TYPE "public"."audit_outcome" AS ENUM('pending', 'success', 'denied', 'failure');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"action" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"attempted_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"id" uuid PRIMARY KEY NOT NULL,
	"impersonator_name" text,
	"impersonator_user_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" "audit_outcome" NOT NULL,
	"target_id" text,
	"target_type" text,
	"trace_id" text
);
--> statement-breakpoint
CREATE INDEX "audit_log_attempted_at_idx" ON "audit_log" USING btree ("attempted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_attempted_at_idx" ON "audit_log" USING btree ("actor_user_id","attempted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_action_attempted_at_idx" ON "audit_log" USING btree ("action","attempted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_outcome_attempted_at_idx" ON "audit_log" USING btree ("outcome","attempted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_target_attempted_at_idx" ON "audit_log" USING btree ("target_type","target_id","attempted_at" DESC NULLS LAST);