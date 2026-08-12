CREATE TABLE "kalakriti_competition_division" (
	"age_category_id" uuid NOT NULL,
	"capacity" integer NOT NULL,
	"competition_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "kalakriti_competition_division_editionId_id_uq" UNIQUE("edition_id","id"),
	CONSTRAINT "kalakriti_competition_division_capacity_chk" CHECK ("kalakriti_competition_division"."capacity" > 0)
);
--> statement-breakpoint
ALTER TABLE "kalakriti_competition_division" ADD CONSTRAINT "kalakriti_competition_division_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_division" ADD CONSTRAINT "kalakriti_competition_division_edition_competition_fk" FOREIGN KEY ("edition_id","competition_id") REFERENCES "public"."kalakriti_competition"("edition_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_division" ADD CONSTRAINT "kalakriti_competition_division_edition_age_category_fk" FOREIGN KEY ("edition_id","age_category_id") REFERENCES "public"."kalakriti_age_category"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "kalakriti_competition_division" (
	"age_category_id",
	"capacity",
	"competition_id",
	"created_at",
	"created_by",
	"edition_id",
	"id",
	"updated_at"
)
SELECT
	"age_category_id",
	"capacity",
	"competition_id",
	"created_at",
	"created_by",
	"edition_id",
	"id",
	"updated_at"
FROM "kalakriti_competition_session";--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" RENAME COLUMN "session_id" TO "division_id";--> statement-breakpoint
ALTER TABLE "kalakriti_entry_member" RENAME COLUMN "session_id" TO "division_id";--> statement-breakpoint
ALTER TABLE "kalakriti_entry_member" DROP CONSTRAINT "kalakriti_entry_member_entry_scope_fk";
--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" DROP CONSTRAINT "kalakriti_competition_entry_edition_session_fk";
--> statement-breakpoint
ALTER TABLE "kalakriti_competition_session" DROP CONSTRAINT "kalakriti_competition_session_edition_competition_fk";
--> statement-breakpoint
ALTER TABLE "kalakriti_competition_session" DROP CONSTRAINT "kalakriti_competition_session_edition_age_category_fk";
--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" DROP CONSTRAINT "kalakriti_competition_entry_edition_center_session_id_uq";--> statement-breakpoint
ALTER TABLE "kalakriti_competition_session" DROP CONSTRAINT "kalakriti_competition_session_capacity_chk";--> statement-breakpoint
DROP INDEX "kalakriti_competition_entry_sessionId_idx";--> statement-breakpoint
DROP INDEX "kalakriti_competition_session_competitionId_ageCategoryId_uidx";--> statement-breakpoint
DROP INDEX "kalakriti_entry_member_sessionId_studentId_uidx";--> statement-breakpoint
ALTER TABLE "kalakriti_competition_session" ADD COLUMN "division_id" uuid;--> statement-breakpoint
UPDATE "kalakriti_competition_session" SET "division_id" = "id";--> statement-breakpoint
ALTER TABLE "kalakriti_competition_session" ALTER COLUMN "division_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_competition_division_competitionId_ageCategoryId_uidx" ON "kalakriti_competition_division" USING btree ("competition_id","age_category_id");--> statement-breakpoint
CREATE INDEX "kalakriti_competition_division_editionId_idx" ON "kalakriti_competition_division" USING btree ("edition_id");--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" ADD CONSTRAINT "kalakriti_competition_entry_edition_division_fk" FOREIGN KEY ("edition_id","division_id") REFERENCES "public"."kalakriti_competition_division"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_session" ADD CONSTRAINT "kalakriti_competition_session_edition_division_fk" FOREIGN KEY ("edition_id","division_id") REFERENCES "public"."kalakriti_competition_division"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_entry" ADD CONSTRAINT "kalakriti_competition_entry_edition_center_division_id_uq" UNIQUE("edition_id","center_id","division_id","id");--> statement-breakpoint
ALTER TABLE "kalakriti_entry_member" ADD CONSTRAINT "kalakriti_entry_member_entry_scope_fk" FOREIGN KEY ("edition_id","center_id","division_id","entry_id") REFERENCES "public"."kalakriti_competition_entry"("edition_id","center_id","division_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kalakriti_competition_entry_divisionId_idx" ON "kalakriti_competition_entry" USING btree ("division_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_competition_session_divisionId_uidx" ON "kalakriti_competition_session" USING btree ("division_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_entry_member_divisionId_studentId_uidx" ON "kalakriti_entry_member" USING btree ("division_id","student_id");--> statement-breakpoint
ALTER TABLE "kalakriti_competition_session" DROP COLUMN "age_category_id";--> statement-breakpoint
ALTER TABLE "kalakriti_competition_session" DROP COLUMN "capacity";--> statement-breakpoint
ALTER TABLE "kalakriti_competition_session" DROP COLUMN "competition_id";
