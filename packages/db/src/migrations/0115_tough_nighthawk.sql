CREATE SCHEMA "private";
--> statement-breakpoint
CREATE TYPE "public"."party_kind" AS ENUM('person', 'organisation');--> statement-breakpoint
CREATE TYPE "public"."party_role_kind" AS ENUM('donor', 'sponsor', 'grantor', 'intermediary', 'vendor', 'volunteer', 'judge', 'partner');--> statement-breakpoint
CREATE TYPE "private"."foreign_source_assessment" AS ENUM('domestic', 'foreign', 'pending');--> statement-breakpoint
CREATE TYPE "private"."party_id_type" AS ENUM('pan', 'passport', 'voter_id', 'driving_licence', 'ration_card', 'tax_id_foreign', 'none');--> statement-breakpoint
CREATE TABLE "party" (
	"created_at" timestamp NOT NULL,
	"created_by" text,
	"display_name" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "party_kind" NOT NULL,
	"legal_name" text,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "party_role" (
	"active" boolean DEFAULT true NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"party_id" uuid NOT NULL,
	"role" "party_role_kind" NOT NULL,
	"since" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private"."party_bank_account" (
	"account_name" text NOT NULL,
	"account_number_encrypted" text NOT NULL,
	"account_number_last4" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"ifsc_code" text NOT NULL,
	"party_id" uuid NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private"."party_private" (
	"address_line1" text,
	"address_line2" text,
	"assessed_on" date,
	"assessment_note" text,
	"city" text,
	"country" text DEFAULT 'IN' NOT NULL,
	"email" text,
	"foreign_source_assessment" "private"."foreign_source_assessment" DEFAULT 'domestic' NOT NULL,
	"id_number_encrypted" text,
	"id_number_last4" text,
	"id_type" "private"."party_id_type" DEFAULT 'none' NOT NULL,
	"nationality" text,
	"party_id" uuid PRIMARY KEY NOT NULL,
	"phone" text,
	"pincode" text,
	"state" text,
	"updated_at" timestamp NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "party_id" uuid;--> statement-breakpoint
ALTER TABLE "party" ADD CONSTRAINT "party_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_role" ADD CONSTRAINT "party_role_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."party_bank_account" ADD CONSTRAINT "party_bank_account_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."party_private" ADD CONSTRAINT "party_private_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."party_private" ADD CONSTRAINT "party_private_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "party_displayName_idx" ON "party" USING btree ("display_name");--> statement-breakpoint
CREATE UNIQUE INDEX "party_role_partyId_role_uidx" ON "party_role" USING btree ("party_id","role");--> statement-breakpoint
CREATE INDEX "party_role_role_idx" ON "party_role" USING btree ("role");--> statement-breakpoint
CREATE INDEX "party_bank_account_partyId_idx" ON "private"."party_bank_account" USING btree ("party_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_intermediary_party_id_party_id_fk" FOREIGN KEY ("intermediary_party_id") REFERENCES "public"."party"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_sponsor_party_id_party_id_fk" FOREIGN KEY ("sponsor_party_id") REFERENCES "public"."party"("id") ON DELETE restrict ON UPDATE no action;