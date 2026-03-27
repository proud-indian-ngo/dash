CREATE TYPE "public"."vendor_payment_transaction_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."vendor_payment_status" ADD VALUE 'partially_paid';--> statement-breakpoint
ALTER TYPE "public"."vendor_payment_status" ADD VALUE 'paid';--> statement-breakpoint
CREATE TABLE "vendor_payment_transaction" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_payment_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"description" text,
	"transaction_date" timestamp NOT NULL,
	"payment_method" text,
	"payment_reference" text,
	"status" "vendor_payment_transaction_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "vpt_rejection_reason_chk" CHECK (((status = 'rejected'::vendor_payment_transaction_status) AND (rejection_reason IS NOT NULL)) OR ((status <> 'rejected'::vendor_payment_transaction_status) AND (rejection_reason IS NULL)))
);
--> statement-breakpoint
CREATE TABLE "vendor_payment_transaction_attachment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_payment_transaction_id" uuid NOT NULL,
	"type" "attachment_type" NOT NULL,
	"filename" text,
	"object_key" text,
	"url" text,
	"mime_type" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_payment_transaction_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_payment_transaction_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action" "history_action" NOT NULL,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendor_payment_transaction" ADD CONSTRAINT "vendor_payment_transaction_vendor_payment_id_vendor_payment_id_fk" FOREIGN KEY ("vendor_payment_id") REFERENCES "public"."vendor_payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment_transaction" ADD CONSTRAINT "vendor_payment_transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment_transaction" ADD CONSTRAINT "vendor_payment_transaction_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment_transaction_attachment" ADD CONSTRAINT "vendor_payment_transaction_attachment_vendor_payment_transaction_id_vendor_payment_transaction_id_fk" FOREIGN KEY ("vendor_payment_transaction_id") REFERENCES "public"."vendor_payment_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment_transaction_history" ADD CONSTRAINT "vendor_payment_transaction_history_vendor_payment_transaction_id_vendor_payment_transaction_id_fk" FOREIGN KEY ("vendor_payment_transaction_id") REFERENCES "public"."vendor_payment_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment_transaction_history" ADD CONSTRAINT "vendor_payment_transaction_history_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vpt_vendorPaymentId_idx" ON "vendor_payment_transaction" USING btree ("vendor_payment_id");--> statement-breakpoint
CREATE INDEX "vpt_userId_idx" ON "vendor_payment_transaction" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vpt_status_idx" ON "vendor_payment_transaction" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vpta_vendorPaymentTransactionId_idx" ON "vendor_payment_transaction_attachment" USING btree ("vendor_payment_transaction_id");--> statement-breakpoint
CREATE INDEX "vpth_vendorPaymentTransactionId_idx" ON "vendor_payment_transaction_history" USING btree ("vendor_payment_transaction_id");