CREATE TABLE "kalakriti_entry_music" (
	"id" uuid PRIMARY KEY NOT NULL,
	"edition_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"uploaded_at" timestamp NOT NULL,
	"uploaded_by" text,
	CONSTRAINT "kalakriti_entry_music_slot_chk" CHECK ("kalakriti_entry_music"."slot" IN (1, 2)),
	CONSTRAINT "kalakriti_entry_music_size_chk" CHECK ("kalakriti_entry_music"."byte_size" > 0 AND "kalakriti_entry_music"."byte_size" <= 20971520),
	CONSTRAINT "kalakriti_entry_music_mime_chk" CHECK ("kalakriti_entry_music"."mime_type" IN ('audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a'))
);
--> statement-breakpoint
ALTER TABLE "kalakriti_entry_music" ADD CONSTRAINT "kalakriti_entry_music_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_entry_music" ADD CONSTRAINT "kalakriti_entry_music_entry_scope_fk" FOREIGN KEY ("edition_id","entry_id") REFERENCES "public"."kalakriti_competition_entry"("edition_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_entry_music_entry_slot_uq" ON "kalakriti_entry_music" USING btree ("entry_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_entry_music_object_key_uq" ON "kalakriti_entry_music" USING btree ("object_key");