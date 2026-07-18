CREATE TYPE "public"."kalakriti_gender_eligibility" AS ENUM('male', 'female', 'both');--> statement-breakpoint
CREATE TYPE "public"."kalakriti_participation_mode" AS ENUM('individual', 'group');--> statement-breakpoint
CREATE TABLE "kalakriti_competition" (
	"cancelled_at" timestamp,
	"competition_category_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"gender_eligibility" "kalakriti_gender_eligibility" NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"maximum_group_size" integer NOT NULL,
	"minimum_group_size" integer NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"participation_mode" "kalakriti_participation_mode" NOT NULL,
	"retired_at" timestamp,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "kalakriti_competition_editionId_id_uq" UNIQUE("edition_id","id"),
	CONSTRAINT "kalakriti_competition_group_size_chk" CHECK (("kalakriti_competition"."participation_mode" = 'individual' AND "kalakriti_competition"."minimum_group_size" = 1 AND "kalakriti_competition"."maximum_group_size" = 1)
        OR ("kalakriti_competition"."participation_mode" = 'group' AND "kalakriti_competition"."minimum_group_size" >= 2 AND "kalakriti_competition"."maximum_group_size" >= "kalakriti_competition"."minimum_group_size")),
	CONSTRAINT "kalakriti_competition_normalizedName_chk" CHECK (length("kalakriti_competition"."normalized_name") > 0)
);
--> statement-breakpoint
CREATE TABLE "kalakriti_competition_category" (
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"retired_at" timestamp,
	"sort_order" integer NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "kalakriti_competition_category_editionId_id_uq" UNIQUE("edition_id","id"),
	CONSTRAINT "kalakriti_competition_category_sortOrder_chk" CHECK ("kalakriti_competition_category"."sort_order" >= 0),
	CONSTRAINT "kalakriti_competition_category_normalizedName_chk" CHECK (length("kalakriti_competition_category"."normalized_name") > 0)
);
--> statement-breakpoint
CREATE TABLE "kalakriti_competition_session" (
	"age_category_id" uuid NOT NULL,
	"cancelled_at" timestamp with time zone,
	"capacity" integer NOT NULL,
	"competition_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp NOT NULL,
	"venue_id" uuid NOT NULL,
	CONSTRAINT "kalakriti_competition_session_editionId_id_uq" UNIQUE("edition_id","id"),
	CONSTRAINT "kalakriti_competition_session_capacity_chk" CHECK ("kalakriti_competition_session"."capacity" > 0),
	CONSTRAINT "kalakriti_competition_session_time_range_chk" CHECK ("kalakriti_competition_session"."end_at" > "kalakriti_competition_session"."start_at")
);
--> statement-breakpoint
CREATE TABLE "kalakriti_venue" (
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"retired_at" timestamp,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "kalakriti_venue_editionId_id_uq" UNIQUE("edition_id","id"),
	CONSTRAINT "kalakriti_venue_normalizedName_chk" CHECK (length("kalakriti_venue"."normalized_name") > 0)
);
--> statement-breakpoint
ALTER TABLE "kalakriti_competition" ADD CONSTRAINT "kalakriti_competition_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition" ADD CONSTRAINT "kalakriti_competition_edition_category_fk" FOREIGN KEY ("edition_id","competition_category_id") REFERENCES "public"."kalakriti_competition_category"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_category" ADD CONSTRAINT "kalakriti_competition_category_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_category" ADD CONSTRAINT "kalakriti_competition_category_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_session" ADD CONSTRAINT "kalakriti_competition_session_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_session" ADD CONSTRAINT "kalakriti_competition_session_edition_competition_fk" FOREIGN KEY ("edition_id","competition_id") REFERENCES "public"."kalakriti_competition"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_session" ADD CONSTRAINT "kalakriti_competition_session_edition_age_category_fk" FOREIGN KEY ("edition_id","age_category_id") REFERENCES "public"."kalakriti_age_category"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_competition_session" ADD CONSTRAINT "kalakriti_competition_session_edition_venue_fk" FOREIGN KEY ("edition_id","venue_id") REFERENCES "public"."kalakriti_venue"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_venue" ADD CONSTRAINT "kalakriti_venue_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_venue" ADD CONSTRAINT "kalakriti_venue_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_competition_categoryId_normalizedName_uidx" ON "kalakriti_competition" USING btree ("competition_category_id","normalized_name");--> statement-breakpoint
CREATE INDEX "kalakriti_competition_editionId_categoryId_idx" ON "kalakriti_competition" USING btree ("edition_id","competition_category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_competition_category_editionId_normalizedName_uidx" ON "kalakriti_competition_category" USING btree ("edition_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_competition_category_editionId_sortOrder_uidx" ON "kalakriti_competition_category" USING btree ("edition_id","sort_order");--> statement-breakpoint
CREATE INDEX "kalakriti_competition_category_editionId_idx" ON "kalakriti_competition_category" USING btree ("edition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_competition_session_competitionId_ageCategoryId_uidx" ON "kalakriti_competition_session" USING btree ("competition_id","age_category_id");--> statement-breakpoint
CREATE INDEX "kalakriti_competition_session_editionId_startAt_idx" ON "kalakriti_competition_session" USING btree ("edition_id","start_at");--> statement-breakpoint
CREATE INDEX "kalakriti_competition_session_venueId_startAt_idx" ON "kalakriti_competition_session" USING btree ("venue_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_venue_editionId_normalizedName_uidx" ON "kalakriti_venue" USING btree ("edition_id","normalized_name");--> statement-breakpoint
CREATE INDEX "kalakriti_venue_editionId_idx" ON "kalakriti_venue" USING btree ("edition_id");--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ADD CONSTRAINT "kalakriti_assignment_edition_competition_category_fk" FOREIGN KEY ("edition_id","competition_category_id") REFERENCES "public"."kalakriti_competition_category"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ADD CONSTRAINT "kalakriti_assignment_edition_competition_fk" FOREIGN KEY ("edition_id","competition_id") REFERENCES "public"."kalakriti_competition"("edition_id","id") ON DELETE restrict ON UPDATE no action;