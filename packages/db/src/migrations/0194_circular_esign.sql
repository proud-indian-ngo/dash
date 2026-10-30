CREATE TYPE "public"."signing_mode" AS ENUM('dsc', 'esign');--> statement-breakpoint
CREATE TABLE "private"."esign_document" (
	"circular_id" uuid NOT NULL,
	"closed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"document_id" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"invitees" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "circular" ADD COLUMN "signing_mode" "signing_mode" DEFAULT 'dsc' NOT NULL;--> statement-breakpoint
ALTER TABLE "private"."esign_document" ADD CONSTRAINT "esign_document_circular_id_circular_id_fk" FOREIGN KEY ("circular_id") REFERENCES "public"."circular"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "esign_document_circular_uidx" ON "private"."esign_document" USING btree ("circular_id");--> statement-breakpoint
CREATE UNIQUE INDEX "esign_document_document_uidx" ON "private"."esign_document" USING btree ("document_id");