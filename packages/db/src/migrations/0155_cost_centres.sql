ALTER TABLE "advance_payment" ADD COLUMN "cost_centre_id" uuid;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD COLUMN "cost_centre_id" uuid;--> statement-breakpoint
ALTER TABLE "team_event" ADD COLUMN "cost_centre_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "cost_centre_id" uuid;--> statement-breakpoint
ALTER TABLE "advance_payment" ADD CONSTRAINT "advance_payment_cost_centre_id_cost_centre_id_fk" FOREIGN KEY ("cost_centre_id") REFERENCES "public"."cost_centre"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_cost_centre_id_cost_centre_id_fk" FOREIGN KEY ("cost_centre_id") REFERENCES "public"."cost_centre"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_event" ADD CONSTRAINT "team_event_cost_centre_id_cost_centre_id_fk" FOREIGN KEY ("cost_centre_id") REFERENCES "public"."cost_centre"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_cost_centre_id_cost_centre_id_fk" FOREIGN KEY ("cost_centre_id") REFERENCES "public"."cost_centre"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advance_payment_costCentreId_idx" ON "advance_payment" USING btree ("cost_centre_id");--> statement-breakpoint
CREATE INDEX "reimbursement_costCentreId_idx" ON "reimbursement" USING btree ("cost_centre_id");--> statement-breakpoint
CREATE INDEX "team_event_costCentreId_idx" ON "team_event" USING btree ("cost_centre_id");--> statement-breakpoint
CREATE INDEX "vendor_payment_costCentreId_idx" ON "vendor_payment" USING btree ("cost_centre_id");