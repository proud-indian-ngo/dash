CREATE TYPE "public"."attachment_type" AS ENUM('file', 'url');--> statement-breakpoint
CREATE TYPE "public"."history_action" AS ENUM('created', 'updated', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."reimbursement_city" AS ENUM('bangalore', 'mumbai');--> statement-breakpoint
CREATE TYPE "public"."reimbursement_status" AS ENUM('draft', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "expense_category" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "expense_category_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "reimbursement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"city" "reimbursement_city",
	"expense_date" text NOT NULL,
	"status" "reimbursement_status" DEFAULT 'draft' NOT NULL,
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
CREATE TABLE "reimbursement_attachment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reimbursement_id" uuid NOT NULL,
	"type" "attachment_type" NOT NULL,
	"filename" text,
	"object_key" text,
	"url" text,
	"mime_type" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reimbursement_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reimbursement_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action" "history_action" NOT NULL,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reimbursement_line_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reimbursement_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"description" text,
	"amount" numeric(12, 2) NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_attachment" ADD CONSTRAINT "reimbursement_attachment_reimbursement_id_reimbursement_id_fk" FOREIGN KEY ("reimbursement_id") REFERENCES "public"."reimbursement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_history" ADD CONSTRAINT "reimbursement_history_reimbursement_id_reimbursement_id_fk" FOREIGN KEY ("reimbursement_id") REFERENCES "public"."reimbursement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_history" ADD CONSTRAINT "reimbursement_history_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" ADD CONSTRAINT "reimbursement_line_item_reimbursement_id_reimbursement_id_fk" FOREIGN KEY ("reimbursement_id") REFERENCES "public"."reimbursement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_line_item" ADD CONSTRAINT "reimbursement_line_item_category_id_expense_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reimbursement_userId_idx" ON "reimbursement" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reimbursement_status_idx" ON "reimbursement" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reimbursement_attachment_reimbursementId_idx" ON "reimbursement_attachment" USING btree ("reimbursement_id");--> statement-breakpoint
CREATE INDEX "reimbursement_history_reimbursementId_idx" ON "reimbursement_history" USING btree ("reimbursement_id");--> statement-breakpoint
CREATE INDEX "reimbursement_line_item_reimbursementId_idx" ON "reimbursement_line_item" USING btree ("reimbursement_id");