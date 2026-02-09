CREATE TABLE "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_group" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"jid" text NOT NULL,
	"description" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "whatsapp_group_jid_unique" UNIQUE("jid")
);
