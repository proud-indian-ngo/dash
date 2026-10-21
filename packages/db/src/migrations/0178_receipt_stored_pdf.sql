ALTER TABLE "private"."contribution_receipt_snapshot" ADD COLUMN "pdf_key" text;--> statement-breakpoint
ALTER TABLE "private"."contribution_receipt_snapshot" ADD COLUMN "pdf_sha256" text;--> statement-breakpoint
ALTER TABLE "private"."contribution_receipt_snapshot" ADD COLUMN "signature_key" text;--> statement-breakpoint
CREATE INDEX "contribution_receipt_snapshot_pdf_key_idx" ON "private"."contribution_receipt_snapshot" USING btree ("pdf_key");--> statement-breakpoint
CREATE INDEX "contribution_receipt_snapshot_signature_key_idx" ON "private"."contribution_receipt_snapshot" USING btree ("signature_key");