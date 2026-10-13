CREATE TYPE "private"."email_suppression_reason" AS ENUM('hard_bounce', 'complaint');--> statement-breakpoint
CREATE TABLE "private"."email_suppression" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"email" text PRIMARY KEY NOT NULL,
	"reason" "private"."email_suppression_reason" NOT NULL,
	"resend_email_id" text
);
