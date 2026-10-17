CREATE TABLE "private"."esign_request" (
	"based_on_sha256" text NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"error" text,
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_document_id" text NOT NULL,
	"resolution_id" uuid NOT NULL,
	"status" "private"."signing_job_status" DEFAULT 'pending' NOT NULL,
	"trustee_id" uuid NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "private"."esign_request" ADD CONSTRAINT "esign_request_resolution_id_resolution_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."esign_request" ADD CONSTRAINT "esign_request_trustee_id_trustee_id_fk" FOREIGN KEY ("trustee_id") REFERENCES "public"."trustee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."esign_request" ADD CONSTRAINT "esign_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "esign_request_document_uidx" ON "private"."esign_request" USING btree ("provider_document_id");--> statement-breakpoint
CREATE INDEX "esign_request_resolution_idx" ON "private"."esign_request" USING btree ("resolution_id","trustee_id");