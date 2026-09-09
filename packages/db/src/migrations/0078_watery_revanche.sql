CREATE TYPE "public"."kalakriti_center_scan_stage_type" AS ENUM('pickup', 'venue_arrival', 'venue_departure', 'drop_off');--> statement-breakpoint
ALTER TYPE "public"."kalakriti_operation_type" ADD VALUE 'venue_arrival' BEFORE 'venue_departure';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_transport_status" ADD VALUE 'departed_center' BEFORE 'arrived_at_venue';--> statement-breakpoint
CREATE TABLE "kalakriti_center_scan_stage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"edition_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"stage" "kalakriti_center_scan_stage_type" NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"finalized_at" timestamp,
	"finalized_by" text,
	CONSTRAINT "kalakriti_center_scan_stage_edition_center_stage_uq" UNIQUE("edition_id","center_id","stage"),
	CONSTRAINT "kalakriti_center_scan_stage_finalization_chk" CHECK (("kalakriti_center_scan_stage"."finalized_at" IS NULL AND "kalakriti_center_scan_stage"."finalized_by" IS NULL) OR ("kalakriti_center_scan_stage"."finalized_at" IS NOT NULL AND "kalakriti_center_scan_stage"."finalized_by" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "kalakriti_center_scan_stage" ADD CONSTRAINT "kalakriti_center_scan_stage_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_center_scan_stage" ADD CONSTRAINT "kalakriti_center_scan_stage_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_center_scan_stage" ADD CONSTRAINT "kalakriti_center_scan_stage_finalized_by_user_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_center_scan_stage" ADD CONSTRAINT "kalakriti_center_scan_stage_edition_center_fk" FOREIGN KEY ("edition_id","center_id") REFERENCES "public"."kalakriti_center"("edition_id","id") ON DELETE restrict ON UPDATE no action;