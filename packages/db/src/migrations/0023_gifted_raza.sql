CREATE TABLE "notification_topic_preference" (
	"user_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"whatsapp_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "notification_topic_preference_user_id_topic_id_pk" PRIMARY KEY("user_id","topic_id")
);
--> statement-breakpoint
ALTER TABLE "notification_topic_preference" ADD CONSTRAINT "notification_topic_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;