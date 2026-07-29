ALTER TABLE "kalakriti_center_age_quota" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "kalakriti_center_age_quota" CASCADE;--> statement-breakpoint
ALTER TABLE "kalakriti_age_category" ADD COLUMN "female_student_limit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kalakriti_age_category" ADD COLUMN "male_student_limit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kalakriti_age_category" ADD CONSTRAINT "kalakriti_age_category_student_limits_chk" CHECK ("kalakriti_age_category"."male_student_limit" >= 0 AND "kalakriti_age_category"."female_student_limit" >= 0);