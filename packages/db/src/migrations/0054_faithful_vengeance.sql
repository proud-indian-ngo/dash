CREATE TABLE "kalakriti_age_category" (
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"maximum_age" integer NOT NULL,
	"max_competitions_per_category" integer NOT NULL,
	"max_total_competitions" integer NOT NULL,
	"minimum_age" integer NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "kalakriti_age_category_editionId_id_uq" UNIQUE("edition_id","id"),
	CONSTRAINT "kalakriti_age_category_age_range_chk" CHECK ("kalakriti_age_category"."minimum_age" BETWEEN 0 AND 100 AND "kalakriti_age_category"."maximum_age" BETWEEN "kalakriti_age_category"."minimum_age" AND 100),
	CONSTRAINT "kalakriti_age_category_competition_limits_chk" CHECK ("kalakriti_age_category"."max_total_competitions" > 0 AND "kalakriti_age_category"."max_competitions_per_category" > 0 AND "kalakriti_age_category"."max_competitions_per_category" <= "kalakriti_age_category"."max_total_competitions"),
	CONSTRAINT "kalakriti_age_category_sortOrder_chk" CHECK ("kalakriti_age_category"."sort_order" >= 0),
	CONSTRAINT "kalakriti_age_category_normalizedName_chk" CHECK (length("kalakriti_age_category"."normalized_name") > 0)
);
--> statement-breakpoint
CREATE TABLE "kalakriti_center_age_quota" (
	"age_category_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"female_student_limit" integer NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"male_student_limit" integer NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "kalakriti_center_age_quota_limits_chk" CHECK ("kalakriti_center_age_quota"."male_student_limit" >= 0 AND "kalakriti_center_age_quota"."female_student_limit" >= 0)
);
--> statement-breakpoint
ALTER TABLE "kalakriti_age_category" ADD CONSTRAINT "kalakriti_age_category_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_age_category" ADD CONSTRAINT "kalakriti_age_category_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_center_age_quota" ADD CONSTRAINT "kalakriti_center_age_quota_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_center_age_quota" ADD CONSTRAINT "kalakriti_center_age_quota_edition_center_fk" FOREIGN KEY ("edition_id","center_id") REFERENCES "public"."kalakriti_center"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_center_age_quota" ADD CONSTRAINT "kalakriti_center_age_quota_edition_age_category_fk" FOREIGN KEY ("edition_id","age_category_id") REFERENCES "public"."kalakriti_age_category"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_age_category_editionId_normalizedName_uidx" ON "kalakriti_age_category" USING btree ("edition_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_age_category_editionId_sortOrder_uidx" ON "kalakriti_age_category" USING btree ("edition_id","sort_order");--> statement-breakpoint
CREATE INDEX "kalakriti_age_category_editionId_idx" ON "kalakriti_age_category" USING btree ("edition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_center_age_quota_centerId_ageCategoryId_uidx" ON "kalakriti_center_age_quota" USING btree ("center_id","age_category_id");--> statement-breakpoint
CREATE INDEX "kalakriti_center_age_quota_editionId_idx" ON "kalakriti_center_age_quota" USING btree ("edition_id");