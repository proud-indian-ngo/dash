ALTER TABLE "expense_category" ADD COLUMN "account_head_id" uuid;--> statement-breakpoint
ALTER TABLE "org_account" ADD COLUMN "is_main" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_category" ADD CONSTRAINT "expense_category_account_head_id_account_head_id_fk" FOREIGN KEY ("account_head_id") REFERENCES "public"."account_head"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_category_accountHeadId_idx" ON "expense_category" USING btree ("account_head_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_account_is_main_uidx" ON "org_account" USING btree ("is_main") WHERE "org_account"."is_main";--> statement-breakpoint
ALTER TABLE "org_account" ADD CONSTRAINT "org_account_is_main_bank_chk" CHECK (NOT "org_account"."is_main" OR "org_account"."kind" = 'bank');