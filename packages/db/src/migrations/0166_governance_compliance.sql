CREATE TYPE "public"."compliance_item_status" AS ENUM('open', 'done', 'waived');--> statement-breakpoint
CREATE TYPE "public"."compliance_rule_kind" AS ENUM('yearly', 'registration', 'term_end');--> statement-breakpoint
CREATE TABLE "compliance_item" (
	"closed_at" timestamp,
	"closed_by" text,
	"created_at" timestamp NOT NULL,
	"due_on" date NOT NULL,
	"evidence_document_id" uuid,
	"fiscal_year" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"note" text,
	"owner_user_id" text,
	"source_key" text,
	"status" "compliance_item_status" DEFAULT 'open' NOT NULL,
	"template_id" uuid,
	"title" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_template" (
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL,
	"dates" jsonb,
	"description" text,
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"kind" "compliance_rule_kind" NOT NULL,
	"offset_days" integer,
	"owner_user_id" text,
	"registration_type" text,
	"title" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compliance_item" ADD CONSTRAINT "compliance_item_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_item" ADD CONSTRAINT "compliance_item_evidence_document_id_governance_document_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."governance_document"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_item" ADD CONSTRAINT "compliance_item_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_item" ADD CONSTRAINT "compliance_item_template_id_compliance_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."compliance_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_template" ADD CONSTRAINT "compliance_template_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_item_source_uidx" ON "compliance_item" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "compliance_item_due_idx" ON "compliance_item" USING btree ("status","due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_template_key_uidx" ON "compliance_template" USING btree ("key");