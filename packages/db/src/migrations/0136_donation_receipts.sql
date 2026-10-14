CREATE TABLE "contribution_receipt" (
	"contribution_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"emailed_at" timestamp,
	"fiscal_year" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"issued_by" text,
	"issued_on" date NOT NULL,
	"number" text NOT NULL,
	"sequence" integer NOT NULL,
	"void_reason" text,
	"voided_at" timestamp,
	"voided_by" text,
	CONSTRAINT "contribution_receipt_sequence_positive" CHECK ("contribution_receipt"."sequence" > 0),
	CONSTRAINT "contribution_receipt_void_reason" CHECK (("contribution_receipt"."voided_at" IS NULL) = ("contribution_receipt"."void_reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "private"."contribution_receipt_counter" (
	"fiscal_year" text PRIMARY KEY NOT NULL,
	"last_sequence" integer NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private"."contribution_receipt_snapshot" (
	"created_at" timestamp NOT NULL,
	"document" jsonb NOT NULL,
	"id_number_encrypted" text,
	"receipt_id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contribution_receipt" ADD CONSTRAINT "contribution_receipt_contribution_id_contribution_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contribution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_receipt" ADD CONSTRAINT "contribution_receipt_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_receipt" ADD CONSTRAINT "contribution_receipt_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."contribution_receipt_snapshot" ADD CONSTRAINT "contribution_receipt_snapshot_receipt_id_contribution_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."contribution_receipt"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contribution_receipt_number_uidx" ON "contribution_receipt" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "contribution_receipt_fy_sequence_uidx" ON "contribution_receipt" USING btree ("fiscal_year","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "contribution_receipt_live_uidx" ON "contribution_receipt" USING btree ("contribution_id") WHERE "contribution_receipt"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "contribution_receipt_contributionId_idx" ON "contribution_receipt" USING btree ("contribution_id");--> statement-breakpoint
CREATE INDEX "contribution_receipt_issuedOn_idx" ON "contribution_receipt" USING btree ("issued_on");