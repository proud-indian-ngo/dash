CREATE TYPE "private"."held_notification_channel" AS ENUM('email', 'whatsapp');--> statement-breakpoint
CREATE TABLE "private"."held_notification" (
	"body" text NOT NULL,
	"cleared_at" timestamp,
	"click_action" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"digest" jsonb,
	"email_html" text,
	"key" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"topic_id" text NOT NULL,
	"whatsapp_text" text
);
--> statement-breakpoint
CREATE TABLE "private"."held_notification_recipient" (
	"attempts" integer DEFAULT 0 NOT NULL,
	"batch_id" text,
	"channel" "private"."held_notification_channel" NOT NULL,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"held_key" text NOT NULL,
	"sent_at" timestamp,
	"topic_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "held_notification_recipient_held_key_user_id_channel_pk" PRIMARY KEY("held_key","user_id","channel")
);
--> statement-breakpoint
ALTER TABLE "private"."held_notification_recipient" ADD CONSTRAINT "held_notification_recipient_held_key_held_notification_key_fk" FOREIGN KEY ("held_key") REFERENCES "private"."held_notification"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."held_notification_recipient" ADD CONSTRAINT "held_notification_recipient_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "held_notification_created_at_idx" ON "private"."held_notification" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "held_notification_recipient_unsent_idx" ON "private"."held_notification_recipient" USING btree ("user_id","topic_id","channel","created_at") WHERE "private"."held_notification_recipient"."sent_at" is null;