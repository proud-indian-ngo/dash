DROP INDEX "kalakriti_credential_active_studentId_uidx";--> statement-breakpoint
ALTER TABLE "kalakriti_credential" ALTER COLUMN "student_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "kalakriti_credential" ADD COLUMN "membership_id" uuid;--> statement-breakpoint
ALTER TABLE "kalakriti_edition" ADD COLUMN "next_volunteer_sequence" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "kalakriti_edition_membership" ADD COLUMN "human_id" text;--> statement-breakpoint
ALTER TABLE "kalakriti_credential" ADD CONSTRAINT "kalakriti_credential_edition_membership_fk" FOREIGN KEY ("edition_id","membership_id") REFERENCES "public"."kalakriti_edition_membership"("edition_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_credential_active_membershipId_uidx" ON "kalakriti_credential" USING btree ("membership_id") WHERE "kalakriti_credential"."membership_id" IS NOT NULL AND "kalakriti_credential"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_membership_humanId_uidx" ON "kalakriti_edition_membership" USING btree ("human_id") WHERE "kalakriti_edition_membership"."human_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_credential_active_studentId_uidx" ON "kalakriti_credential" USING btree ("student_id") WHERE "kalakriti_credential"."student_id" IS NOT NULL AND "kalakriti_credential"."revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "kalakriti_credential" ADD CONSTRAINT "kalakriti_credential_subject_chk" CHECK ((
        "kalakriti_credential"."student_id" IS NOT NULL AND "kalakriti_credential"."membership_id" IS NULL
      ) OR (
        "kalakriti_credential"."student_id" IS NULL AND "kalakriti_credential"."membership_id" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "kalakriti_edition" ADD CONSTRAINT "kalakriti_edition_nextVolunteerSequence_chk" CHECK ("kalakriti_edition"."next_volunteer_sequence" > 0);