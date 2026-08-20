ALTER TABLE "kalakriti_competition" ADD COLUMN "music_upload_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" ADD COLUMN "music_byte_size" integer;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" ADD COLUMN "music_file_name" text;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" ADD COLUMN "music_mime_type" text;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" ADD COLUMN "music_object_key" text;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" ADD COLUMN "music_uploaded_at" timestamp;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" ADD COLUMN "music_uploaded_by" text;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" ADD CONSTRAINT "kalakriti_competition_entry_music_uploaded_by_user_id_fk" FOREIGN KEY ("music_uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" ADD CONSTRAINT "kalakriti_competition_entry_music_chk" CHECK ((
        "kalakriti_competition_entry"."music_object_key" IS NULL
        AND "kalakriti_competition_entry"."music_file_name" IS NULL
        AND "kalakriti_competition_entry"."music_mime_type" IS NULL
        AND "kalakriti_competition_entry"."music_byte_size" IS NULL
        AND "kalakriti_competition_entry"."music_uploaded_at" IS NULL
        AND "kalakriti_competition_entry"."music_uploaded_by" IS NULL
      ) OR (
        "kalakriti_competition_entry"."music_object_key" IS NOT NULL
        AND "kalakriti_competition_entry"."music_file_name" IS NOT NULL
        AND "kalakriti_competition_entry"."music_mime_type" IS NOT NULL
        AND "kalakriti_competition_entry"."music_byte_size" IS NOT NULL
        AND "kalakriti_competition_entry"."music_byte_size" > 0
        AND "kalakriti_competition_entry"."music_uploaded_at" IS NOT NULL
        AND "kalakriti_competition_entry"."music_uploaded_by" IS NOT NULL
      ));