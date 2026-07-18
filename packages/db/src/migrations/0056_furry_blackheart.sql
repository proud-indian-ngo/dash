CREATE TYPE "public"."kalakriti_student_gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TABLE "kalakriti_credential" (
	"created_at" timestamp NOT NULL,
	"edition_id" uuid NOT NULL,
	"human_id" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"issued_at" timestamp NOT NULL,
	"issued_by" text NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" text,
	"student_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	CONSTRAINT "kalakriti_credential_tokenHash_chk" CHECK ("kalakriti_credential"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "kalakriti_credential_revocation_chk" CHECK (("kalakriti_credential"."revoked_at" IS NULL AND "kalakriti_credential"."revoked_by" IS NULL)
        OR ("kalakriti_credential"."revoked_at" IS NOT NULL AND "kalakriti_credential"."revoked_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "kalakriti_student" (
	"age_category_id" uuid NOT NULL,
	"age_category_override_at" timestamp,
	"age_category_override_by" text,
	"age_category_override_reason" text,
	"center_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"derived_age_category_id" uuid NOT NULL,
	"duplicate_confirmed_at" timestamp,
	"duplicate_confirmed_by" text,
	"edition_id" uuid NOT NULL,
	"gender" "kalakriti_student_gender" NOT NULL,
	"human_id" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"updated_at" timestamp NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "kalakriti_student_editionId_id_uq" UNIQUE("edition_id","id"),
	CONSTRAINT "kalakriti_student_normalizedName_chk" CHECK (length("kalakriti_student"."normalized_name") > 0),
	CONSTRAINT "kalakriti_student_age_category_override_chk" CHECK ((
        "kalakriti_student"."age_category_id" = "kalakriti_student"."derived_age_category_id"
        AND "kalakriti_student"."age_category_override_at" IS NULL
        AND "kalakriti_student"."age_category_override_by" IS NULL
        AND "kalakriti_student"."age_category_override_reason" IS NULL
      ) OR (
        "kalakriti_student"."age_category_id" <> "kalakriti_student"."derived_age_category_id"
        AND "kalakriti_student"."age_category_override_at" IS NOT NULL
        AND "kalakriti_student"."age_category_override_by" IS NOT NULL
        AND length("kalakriti_student"."age_category_override_reason") > 0
      )),
	CONSTRAINT "kalakriti_student_duplicate_confirmation_chk" CHECK (("kalakriti_student"."duplicate_confirmed_at" IS NULL AND "kalakriti_student"."duplicate_confirmed_by" IS NULL)
        OR ("kalakriti_student"."duplicate_confirmed_at" IS NOT NULL AND "kalakriti_student"."duplicate_confirmed_by" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "kalakriti_edition" ADD COLUMN "next_student_sequence" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "kalakriti_credential" ADD CONSTRAINT "kalakriti_credential_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_credential" ADD CONSTRAINT "kalakriti_credential_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_credential" ADD CONSTRAINT "kalakriti_credential_edition_student_fk" FOREIGN KEY ("edition_id","student_id") REFERENCES "public"."kalakriti_student"("edition_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_student" ADD CONSTRAINT "kalakriti_student_age_category_override_by_user_id_fk" FOREIGN KEY ("age_category_override_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_student" ADD CONSTRAINT "kalakriti_student_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_student" ADD CONSTRAINT "kalakriti_student_duplicate_confirmed_by_user_id_fk" FOREIGN KEY ("duplicate_confirmed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_student" ADD CONSTRAINT "kalakriti_student_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_student" ADD CONSTRAINT "kalakriti_student_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_student" ADD CONSTRAINT "kalakriti_student_edition_center_fk" FOREIGN KEY ("edition_id","center_id") REFERENCES "public"."kalakriti_center"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_student" ADD CONSTRAINT "kalakriti_student_edition_derived_age_category_fk" FOREIGN KEY ("edition_id","derived_age_category_id") REFERENCES "public"."kalakriti_age_category"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_student" ADD CONSTRAINT "kalakriti_student_edition_age_category_fk" FOREIGN KEY ("edition_id","age_category_id") REFERENCES "public"."kalakriti_age_category"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_credential_tokenHash_uidx" ON "kalakriti_credential" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_credential_active_studentId_uidx" ON "kalakriti_credential" USING btree ("student_id") WHERE "kalakriti_credential"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "kalakriti_credential_editionId_humanId_idx" ON "kalakriti_credential" USING btree ("edition_id","human_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_student_humanId_uidx" ON "kalakriti_student" USING btree ("human_id");--> statement-breakpoint
CREATE INDEX "kalakriti_student_editionId_centerId_idx" ON "kalakriti_student" USING btree ("edition_id","center_id");--> statement-breakpoint
CREATE INDEX "kalakriti_student_centerId_ageCategoryId_gender_idx" ON "kalakriti_student" USING btree ("center_id","age_category_id","gender");--> statement-breakpoint
CREATE INDEX "kalakriti_student_duplicate_lookup_idx" ON "kalakriti_student" USING btree ("center_id","normalized_name","date_of_birth");--> statement-breakpoint
ALTER TABLE "kalakriti_edition" ADD CONSTRAINT "kalakriti_edition_nextStudentSequence_chk" CHECK ("kalakriti_edition"."next_student_sequence" > 0);