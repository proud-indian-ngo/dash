CREATE TYPE "public"."user_gender" AS ENUM('male', 'female');--> statement-breakpoint
UPDATE "user"
SET "gender" = NULL
WHERE "gender" IS NOT NULL
  AND "gender" NOT IN ('male', 'female');--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "gender" SET DATA TYPE "public"."user_gender" USING "gender"::"public"."user_gender";
