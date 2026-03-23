CREATE TYPE "public"."vendor_payment_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."vendor_status" AS ENUM('pending', 'approved');--> statement-breakpoint
CREATE TABLE "vendor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text NOT NULL,
	"bank_account_name" text NOT NULL,
	"bank_account_number" text NOT NULL,
	"bank_account_ifsc_code" text NOT NULL,
	"address" text,
	"gst_number" text,
	"pan_number" text,
	"status" "vendor_status" DEFAULT 'pending' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_payment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"title" text NOT NULL,
	"invoice_number" text,
	"invoice_date" text NOT NULL,
	"status" "vendor_payment_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"approval_screenshot_key" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"submitted_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "vendor_payment_rejection_reason_chk" CHECK ((status = 'rejected' AND rejection_reason IS NOT NULL) OR (status != 'rejected' AND rejection_reason IS NULL))
);
--> statement-breakpoint
CREATE TABLE "vendor_payment_attachment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_payment_id" uuid NOT NULL,
	"type" "attachment_type" NOT NULL,
	"filename" text,
	"object_key" text,
	"url" text,
	"mime_type" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_payment_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_payment_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action" "history_action" NOT NULL,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_payment_line_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_payment_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"description" text,
	"amount" numeric(12, 2) NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment_attachment" ADD CONSTRAINT "vendor_payment_attachment_vendor_payment_id_vendor_payment_id_fk" FOREIGN KEY ("vendor_payment_id") REFERENCES "public"."vendor_payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment_history" ADD CONSTRAINT "vendor_payment_history_vendor_payment_id_vendor_payment_id_fk" FOREIGN KEY ("vendor_payment_id") REFERENCES "public"."vendor_payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment_history" ADD CONSTRAINT "vendor_payment_history_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment_line_item" ADD CONSTRAINT "vendor_payment_line_item_vendor_payment_id_vendor_payment_id_fk" FOREIGN KEY ("vendor_payment_id") REFERENCES "public"."vendor_payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment_line_item" ADD CONSTRAINT "vendor_payment_line_item_category_id_expense_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendor_status_idx" ON "vendor" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vendor_createdBy_idx" ON "vendor" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "vendor_payment_userId_idx" ON "vendor_payment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vendor_payment_vendorId_idx" ON "vendor_payment" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_payment_status_idx" ON "vendor_payment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vendor_payment_attachment_vendorPaymentId_idx" ON "vendor_payment_attachment" USING btree ("vendor_payment_id");--> statement-breakpoint
CREATE INDEX "vendor_payment_history_vendorPaymentId_idx" ON "vendor_payment_history" USING btree ("vendor_payment_id");--> statement-breakpoint
CREATE INDEX "vendor_payment_line_item_vendorPaymentId_idx" ON "vendor_payment_line_item" USING btree ("vendor_payment_id");