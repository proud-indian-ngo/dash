CREATE TABLE "private"."email_batch_recipients" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"recipients" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_batch_recipients_created_at_idx" ON "private"."email_batch_recipients" USING btree ("created_at");