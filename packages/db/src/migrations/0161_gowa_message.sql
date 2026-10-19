CREATE TYPE "private"."gowa_message_kind" AS ENUM('group_post', 'direct');--> statement-breakpoint
CREATE TABLE "private"."gowa_message" (
	"attachment_count" integer DEFAULT 0 NOT NULL,
	"chat_jid" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"error" text,
	"event_id" uuid,
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" text,
	"kind" "private"."gowa_message_kind" NOT NULL,
	"scheduled_message_id" uuid,
	"source" text NOT NULL,
	"text" text NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "private"."gowa_message_part" (
	"gowa_message_id" uuid NOT NULL,
	"message_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private"."gowa_receipt" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp,
	"display_name" text,
	"message_id" text NOT NULL,
	"person_jid" text NOT NULL,
	"read_at" timestamp,
	CONSTRAINT "gowa_receipt_message_id_person_jid_pk" PRIMARY KEY("message_id","person_jid")
);
--> statement-breakpoint
ALTER TABLE "private"."gowa_message" ADD CONSTRAINT "gowa_message_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."gowa_message" ADD CONSTRAINT "gowa_message_scheduled_message_id_scheduled_message_id_fk" FOREIGN KEY ("scheduled_message_id") REFERENCES "public"."scheduled_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."gowa_message" ADD CONSTRAINT "gowa_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."gowa_message_part" ADD CONSTRAINT "gowa_message_part_gowa_message_id_gowa_message_id_fk" FOREIGN KEY ("gowa_message_id") REFERENCES "private"."gowa_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gowa_message_created_at_idx" ON "private"."gowa_message" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "gowa_message_idempotency_key_idx" ON "private"."gowa_message" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "gowa_message_part_gowa_message_idx" ON "private"."gowa_message_part" USING btree ("gowa_message_id");--> statement-breakpoint
CREATE INDEX "gowa_receipt_created_at_idx" ON "private"."gowa_receipt" USING btree ("created_at");