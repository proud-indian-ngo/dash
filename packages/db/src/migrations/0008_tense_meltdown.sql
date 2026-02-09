ALTER TABLE "user" ADD COLUMN "is_on_whatsapp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_phone_unique" UNIQUE("phone");