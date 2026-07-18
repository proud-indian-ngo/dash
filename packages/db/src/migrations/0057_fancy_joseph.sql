CREATE TABLE "kalakriti_competition_entry" (
	"center_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"participation_mode" "kalakriti_participation_mode" NOT NULL,
	"session_id" uuid NOT NULL,
	"updated_at" timestamp NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "kalakriti_competition_entry_edition_center_session_id_uq" UNIQUE("edition_id","center_id","session_id","id")
);
--> statement-breakpoint
CREATE TABLE "kalakriti_entry_member" (
	"center_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kalakriti_student" ADD CONSTRAINT "kalakriti_student_editionId_centerId_id_uq" UNIQUE("edition_id","center_id","id");--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" ADD CONSTRAINT "kalakriti_competition_entry_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" ADD CONSTRAINT "kalakriti_competition_entry_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" ADD CONSTRAINT "kalakriti_competition_entry_edition_center_fk" FOREIGN KEY ("edition_id","center_id") REFERENCES "public"."kalakriti_center"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" ADD CONSTRAINT "kalakriti_competition_entry_edition_session_fk" FOREIGN KEY ("edition_id","session_id") REFERENCES "public"."kalakriti_competition_session"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_entry_member" ADD CONSTRAINT "kalakriti_entry_member_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_entry_member" ADD CONSTRAINT "kalakriti_entry_member_entry_scope_fk" FOREIGN KEY ("edition_id","center_id","session_id","entry_id") REFERENCES "public"."kalakriti_competition_entry"("edition_id","center_id","session_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_entry_member" ADD CONSTRAINT "kalakriti_entry_member_student_scope_fk" FOREIGN KEY ("edition_id","center_id","student_id") REFERENCES "public"."kalakriti_student"("edition_id","center_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kalakriti_competition_entry_editionId_centerId_idx" ON "kalakriti_competition_entry" USING btree ("edition_id","center_id");--> statement-breakpoint
CREATE INDEX "kalakriti_competition_entry_sessionId_idx" ON "kalakriti_competition_entry" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_entry_member_entryId_studentId_uidx" ON "kalakriti_entry_member" USING btree ("entry_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_entry_member_sessionId_studentId_uidx" ON "kalakriti_entry_member" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE INDEX "kalakriti_entry_member_editionId_centerId_idx" ON "kalakriti_entry_member" USING btree ("edition_id","center_id");--> statement-breakpoint
CREATE INDEX "kalakriti_entry_member_studentId_idx" ON "kalakriti_entry_member" USING btree ("student_id");
