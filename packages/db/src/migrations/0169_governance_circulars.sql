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
ALTER TABLE "resolution" DROP COLUMN "issued_at";--> statement-breakpoint
ALTER TABLE "resolution" DROP COLUMN "issued_by_trustee_id";--> statement-breakpoint
ALTER TABLE "resolution" DROP COLUMN "response_due_on";--> statement-breakpoint
ALTER TABLE "private"."signing_job" DROP COLUMN "resolution_id";