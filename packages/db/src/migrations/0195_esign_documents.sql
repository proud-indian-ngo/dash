ALTER TABLE "private"."esign_document" ALTER COLUMN "circular_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conflict_declaration" ADD COLUMN "signing_mode" "signing_mode" DEFAULT 'dsc' NOT NULL;--> statement-breakpoint
ALTER TABLE "utilisation_certificate" ADD COLUMN "signing_mode" "signing_mode" DEFAULT 'dsc' NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "minutes_signing_mode" "signing_mode";--> statement-breakpoint
ALTER TABLE "private"."esign_document" ADD COLUMN "certificate_id" uuid;--> statement-breakpoint
ALTER TABLE "private"."esign_document" ADD COLUMN "declaration_id" uuid;--> statement-breakpoint
ALTER TABLE "private"."esign_document" ADD COLUMN "meeting_id" uuid;--> statement-breakpoint
ALTER TABLE "private"."esign_document" ADD CONSTRAINT "esign_document_certificate_id_utilisation_certificate_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."utilisation_certificate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."esign_document" ADD CONSTRAINT "esign_document_declaration_id_conflict_declaration_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."conflict_declaration"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."esign_document" ADD CONSTRAINT "esign_document_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "esign_document_meeting_uidx" ON "private"."esign_document" USING btree ("meeting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "esign_document_declaration_uidx" ON "private"."esign_document" USING btree ("declaration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "esign_document_certificate_uidx" ON "private"."esign_document" USING btree ("certificate_id");--> statement-breakpoint
ALTER TABLE "private"."esign_document" ADD CONSTRAINT "esign_document_one_target" CHECK (num_nonnulls("private"."esign_document"."circular_id", "private"."esign_document"."meeting_id", "private"."esign_document"."declaration_id", "private"."esign_document"."certificate_id") = 1);