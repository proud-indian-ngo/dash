CREATE TABLE "budget" (
	"created_at" timestamp NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"note" text,
	"programme_id" uuid NOT NULL,
	"project_id" uuid,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "budget_scope_unique" UNIQUE NULLS NOT DISTINCT("fiscal_year_id","programme_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "budget_line" (
	"account_head_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"budget_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	CONSTRAINT "budget_line_budget_head_unique" UNIQUE("budget_id","account_head_id"),
	CONSTRAINT "budget_line_amount_check" CHECK ("budget_line"."amount_paise" >= 0)
);
--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_fiscal_year_id_fiscal_year_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_programme_id_programme_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programme"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_project_programme_fk" FOREIGN KEY ("project_id","programme_id") REFERENCES "public"."project"("id","programme_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_account_head_id_account_head_id_fk" FOREIGN KEY ("account_head_id") REFERENCES "public"."account_head"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;