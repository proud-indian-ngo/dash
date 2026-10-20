CREATE TYPE "public"."policy_audience" AS ENUM('everyone', 'trustees');--> statement-breakpoint
ALTER TYPE "public"."governance_document_kind" ADD VALUE 'declaration' BEFORE 'evidence';--> statement-breakpoint
ALTER TYPE "public"."resolution_template_key" ADD VALUE 'budget_approval';--> statement-breakpoint
ALTER TYPE "public"."resolution_template_key" ADD VALUE 'accounts_approval';--> statement-breakpoint
ALTER TYPE "public"."resolution_template_key" ADD VALUE 'auditor_appointment';--> statement-breakpoint
ALTER TYPE "public"."resolution_template_key" ADD VALUE 'accumulation';--> statement-breakpoint
CREATE TABLE "conflict_declaration" (
	"created_at" timestamp NOT NULL,
	"declared_at" timestamp NOT NULL,
	"declared_by" text,
	"document_id" uuid,
	"fiscal_year" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"interests" jsonb NOT NULL,
	"nothing_to_declare" boolean NOT NULL,
	"trustee_id" uuid NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy" (
	"audience" "policy_audience" DEFAULT 'everyone' NOT NULL,
	"created_at" timestamp NOT NULL,
	"description" text,
	"gates_children" boolean DEFAULT false NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text,
	"title" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_acknowledgement" (
	"acknowledged_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_version" (
	"document_id" uuid NOT NULL,
	"effective_on" date NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"policy_id" uuid NOT NULL,
	"published_at" timestamp NOT NULL,
	"published_by" text,
	"summary" text,
	"version" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "works_with_children" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conflict_declaration" ADD CONSTRAINT "conflict_declaration_declared_by_user_id_fk" FOREIGN KEY ("declared_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_declaration" ADD CONSTRAINT "conflict_declaration_document_id_governance_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."governance_document"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_declaration" ADD CONSTRAINT "conflict_declaration_trustee_id_trustee_id_fk" FOREIGN KEY ("trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_acknowledgement" ADD CONSTRAINT "policy_acknowledgement_policy_version_id_policy_version_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_acknowledgement" ADD CONSTRAINT "policy_acknowledgement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_version" ADD CONSTRAINT "policy_version_document_id_governance_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."governance_document"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_version" ADD CONSTRAINT "policy_version_policy_id_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_version" ADD CONSTRAINT "policy_version_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conflict_declaration_trustee_year_uidx" ON "conflict_declaration" USING btree ("trustee_id","fiscal_year");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_key_uidx" ON "policy" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_acknowledgement_uidx" ON "policy_acknowledgement" USING btree ("policy_version_id","user_id");--> statement-breakpoint
CREATE INDEX "policy_acknowledgement_user_idx" ON "policy_acknowledgement" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_version_uidx" ON "policy_version" USING btree ("policy_id","version");