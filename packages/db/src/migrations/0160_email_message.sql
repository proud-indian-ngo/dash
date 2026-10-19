CREATE TYPE "private"."email_message_status" AS ENUM('sent', 'delayed', 'delivered', 'complained', 'bounced', 'failed', 'suppressed');--> statement-breakpoint
CREATE TABLE "private"."email_message" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"error" text,
	"key" text,
	"resend_email_id" text PRIMARY KEY NOT NULL,
	"status" "private"."email_message_status" DEFAULT 'sent' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text
);
--> statement-breakpoint
ALTER TABLE "private"."email_message" ADD CONSTRAINT "email_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_message_key_user_idx" ON "private"."email_message" USING btree ("key","user_id");--> statement-breakpoint
CREATE INDEX "email_message_created_at_idx" ON "private"."email_message" USING btree ("created_at");