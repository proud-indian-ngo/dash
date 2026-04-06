ALTER TABLE "reimbursement" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reimbursement_eventId_idx" ON "reimbursement" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "vendor_payment_eventId_idx" ON "vendor_payment" USING btree ("event_id");