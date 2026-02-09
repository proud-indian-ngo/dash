CREATE TYPE "public"."advance_payment_status" AS ENUM('draft', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "advance_payment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"city" "reimbursement_city",
	"status" "advance_payment_status" DEFAULT 'draft' NOT NULL,
	"rejection_reason" text,
	"bank_account_name" text,
	"bank_account_number" text,
	"bank_account_ifsc_code" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"submitted_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advance_payment_attachment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"advance_payment_id" uuid NOT NULL,
	"type" "attachment_type" NOT NULL,
	"filename" text,
	"object_key" text,
	"url" text,
	"mime_type" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advance_payment_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"advance_payment_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action" "history_action" NOT NULL,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advance_payment_line_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"advance_payment_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"description" text,
	"amount" numeric(12, 2) NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "advance_payment" ADD CONSTRAINT "advance_payment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_payment" ADD CONSTRAINT "advance_payment_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_payment_attachment" ADD CONSTRAINT "advance_payment_attachment_advance_payment_id_advance_payment_id_fk" FOREIGN KEY ("advance_payment_id") REFERENCES "public"."advance_payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_payment_history" ADD CONSTRAINT "advance_payment_history_advance_payment_id_advance_payment_id_fk" FOREIGN KEY ("advance_payment_id") REFERENCES "public"."advance_payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_payment_history" ADD CONSTRAINT "advance_payment_history_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_payment_line_item" ADD CONSTRAINT "advance_payment_line_item_advance_payment_id_advance_payment_id_fk" FOREIGN KEY ("advance_payment_id") REFERENCES "public"."advance_payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_payment_line_item" ADD CONSTRAINT "advance_payment_line_item_category_id_expense_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advance_payment_userId_idx" ON "advance_payment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "advance_payment_status_idx" ON "advance_payment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "advance_payment_attachment_advancePaymentId_idx" ON "advance_payment_attachment" USING btree ("advance_payment_id");--> statement-breakpoint
CREATE INDEX "advance_payment_history_advancePaymentId_idx" ON "advance_payment_history" USING btree ("advance_payment_id");--> statement-breakpoint
CREATE INDEX "advance_payment_line_item_advancePaymentId_idx" ON "advance_payment_line_item" USING btree ("advance_payment_id");