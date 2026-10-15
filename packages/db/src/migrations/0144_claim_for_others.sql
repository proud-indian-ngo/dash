ALTER TABLE "reimbursement" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reimbursement_createdBy_idx" ON "reimbursement" USING btree ("created_by");