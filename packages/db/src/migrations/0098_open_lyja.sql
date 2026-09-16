CREATE TABLE "kalakriti_result" (
	"id" uuid PRIMARY KEY NOT NULL,
	"edition_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"winner_entry_id" uuid,
	"runner_up_entry_id" uuid,
	"scorecard_ids" jsonb NOT NULL,
	"updated_at" timestamp NOT NULL,
	"updated_by" text,
	CONSTRAINT "kalakriti_result_division_uq" UNIQUE("division_id"),
	CONSTRAINT "kalakriti_result_edition_id_uq" UNIQUE("edition_id","id"),
	CONSTRAINT "kalakriti_result_status_chk" CHECK ("kalakriti_result"."status" IN ('draft', 'published')),
	CONSTRAINT "kalakriti_result_distinct_chk" CHECK ("kalakriti_result"."winner_entry_id" IS NULL OR "kalakriti_result"."runner_up_entry_id" IS NULL OR "kalakriti_result"."winner_entry_id" <> "kalakriti_result"."runner_up_entry_id"),
	CONSTRAINT "kalakriti_result_published_chk" CHECK ("kalakriti_result"."status" <> 'published' OR ("kalakriti_result"."winner_entry_id" IS NOT NULL AND "kalakriti_result"."runner_up_entry_id" IS NOT NULL AND jsonb_array_length("kalakriti_result"."scorecard_ids") > 0)),
	CONSTRAINT "kalakriti_result_version_chk" CHECK ("kalakriti_result"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "kalakriti_result_revision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"edition_id" uuid NOT NULL,
	"result_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"winner_entry_id" uuid,
	"runner_up_entry_id" uuid,
	"scorecard_ids" jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text,
	CONSTRAINT "kalakriti_result_revision_version_uq" UNIQUE("result_id","version")
);
--> statement-breakpoint
CREATE TABLE "kalakriti_result_scorecard" (
	"id" uuid PRIMARY KEY NOT NULL,
	"edition_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"uploaded_at" timestamp NOT NULL,
	"uploaded_by" text,
	CONSTRAINT "kalakriti_result_scorecard_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "kalakriti_scorecard_size_chk" CHECK ("kalakriti_result_scorecard"."byte_size" > 0 AND "kalakriti_result_scorecard"."byte_size" <= 20971520),
	CONSTRAINT "kalakriti_scorecard_type_chk" CHECK ("kalakriti_result_scorecard"."mime_type" IN ('application/pdf', 'image/jpeg', 'image/png'))
);
--> statement-breakpoint
CREATE TABLE "kalakriti_results_state" (
	"id" uuid PRIMARY KEY NOT NULL,
	"edition_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"winner_points" integer,
	"runner_up_points" integer,
	"finalized_at" timestamp,
	"winner_center_id" uuid,
	"runner_up_center_id" uuid,
	"tie_reason" text,
	CONSTRAINT "kalakriti_results_state_edition_id_unique" UNIQUE("edition_id"),
	CONSTRAINT "kalakriti_results_final_chk" CHECK ("kalakriti_results_state"."finalized_at" IS NULL OR ("kalakriti_results_state"."winner_center_id" IS NOT NULL AND "kalakriti_results_state"."runner_up_center_id" IS NOT NULL AND "kalakriti_results_state"."winner_center_id" <> "kalakriti_results_state"."runner_up_center_id"))
);
--> statement-breakpoint
CREATE TABLE "kalakriti_standings_revision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"edition_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"action" text NOT NULL,
	"winner_center_id" uuid,
	"runner_up_center_id" uuid,
	"winner_points" integer NOT NULL,
	"runner_up_points" integer NOT NULL,
	"tie_reason" text,
	"created_at" timestamp NOT NULL,
	"created_by" text,
	CONSTRAINT "kalakriti_standings_revision_version_uq" UNIQUE("edition_id","version")
);
--> statement-breakpoint
ALTER TABLE "kalakriti_result" ADD CONSTRAINT "kalakriti_result_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_result" ADD CONSTRAINT "kalakriti_result_edition_id_division_id_kalakriti_competition_division_edition_id_id_fk" FOREIGN KEY ("edition_id","division_id") REFERENCES "public"."kalakriti_competition_division"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_result" ADD CONSTRAINT "kalakriti_result_edition_id_division_id_winner_entry_id_kalakriti_competition_entry_edition_id_division_id_id_fk" FOREIGN KEY ("edition_id","division_id","winner_entry_id") REFERENCES "public"."kalakriti_competition_entry"("edition_id","division_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_result" ADD CONSTRAINT "kalakriti_result_edition_id_division_id_runner_up_entry_id_kalakriti_competition_entry_edition_id_division_id_id_fk" FOREIGN KEY ("edition_id","division_id","runner_up_entry_id") REFERENCES "public"."kalakriti_competition_entry"("edition_id","division_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_result_revision" ADD CONSTRAINT "kalakriti_result_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_result_revision" ADD CONSTRAINT "kalakriti_result_revision_edition_id_result_id_kalakriti_result_edition_id_id_fk" FOREIGN KEY ("edition_id","result_id") REFERENCES "public"."kalakriti_result"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_result_scorecard" ADD CONSTRAINT "kalakriti_result_scorecard_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_result_scorecard" ADD CONSTRAINT "kalakriti_result_scorecard_edition_id_division_id_kalakriti_competition_division_edition_id_id_fk" FOREIGN KEY ("edition_id","division_id") REFERENCES "public"."kalakriti_competition_division"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_results_state" ADD CONSTRAINT "kalakriti_results_state_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_results_state" ADD CONSTRAINT "kalakriti_results_state_edition_id_winner_center_id_kalakriti_center_edition_id_id_fk" FOREIGN KEY ("edition_id","winner_center_id") REFERENCES "public"."kalakriti_center"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_results_state" ADD CONSTRAINT "kalakriti_results_state_edition_id_runner_up_center_id_kalakriti_center_edition_id_id_fk" FOREIGN KEY ("edition_id","runner_up_center_id") REFERENCES "public"."kalakriti_center"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_standings_revision" ADD CONSTRAINT "kalakriti_standings_revision_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_standings_revision" ADD CONSTRAINT "kalakriti_standings_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;