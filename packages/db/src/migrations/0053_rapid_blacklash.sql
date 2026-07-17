CREATE TABLE "kalakriti_center" (
	"competition_entry_registration_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"retired_at" timestamp,
	"student_registration_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "kalakriti_center_editionId_id_uq" UNIQUE("edition_id","id"),
	CONSTRAINT "kalakriti_center_normalizedName_chk" CHECK (length("kalakriti_center"."normalized_name") > 0)
);
--> statement-breakpoint
CREATE TABLE "kalakriti_guardian_center" (
	"center_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"membership_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kalakriti_center" ADD CONSTRAINT "kalakriti_center_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_center" ADD CONSTRAINT "kalakriti_center_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_guardian_center" ADD CONSTRAINT "kalakriti_guardian_center_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_guardian_center" ADD CONSTRAINT "kalakriti_guardian_center_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_guardian_center" ADD CONSTRAINT "kalakriti_guardian_center_edition_membership_fk" FOREIGN KEY ("edition_id","membership_id") REFERENCES "public"."kalakriti_edition_membership"("edition_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_guardian_center" ADD CONSTRAINT "kalakriti_guardian_center_edition_center_fk" FOREIGN KEY ("edition_id","center_id") REFERENCES "public"."kalakriti_center"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_center_editionId_normalizedName_uidx" ON "kalakriti_center" USING btree ("edition_id","normalized_name");--> statement-breakpoint
CREATE INDEX "kalakriti_center_editionId_idx" ON "kalakriti_center" USING btree ("edition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_guardian_center_membershipId_centerId_uidx" ON "kalakriti_guardian_center" USING btree ("membership_id","center_id");--> statement-breakpoint
CREATE INDEX "kalakriti_guardian_center_editionId_centerId_idx" ON "kalakriti_guardian_center" USING btree ("edition_id","center_id");--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ADD CONSTRAINT "kalakriti_assignment_edition_center_fk" FOREIGN KEY ("edition_id","center_id") REFERENCES "public"."kalakriti_center"("edition_id","id") ON DELETE restrict ON UPDATE no action;