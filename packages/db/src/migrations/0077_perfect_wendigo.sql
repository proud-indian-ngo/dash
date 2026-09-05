CREATE TYPE "public"."kalakriti_transport_status" AS ENUM('planned', 'arrived_at_center', 'arrived_at_venue', 'departed_venue', 'completed');--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'transport_coordinator' BEFORE 'logistics_lead';--> statement-breakpoint
CREATE TABLE "kalakriti_transport_assignment" (
	"capacity" integer NOT NULL,
	"center_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"driver_name" text NOT NULL,
	"driver_phone" text,
	"edition_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"notes" text,
	"status" "kalakriti_transport_status" DEFAULT 'planned' NOT NULL,
	"updated_at" timestamp NOT NULL,
	"vehicle_label" text NOT NULL,
	CONSTRAINT "kalakriti_transport_assignment_editionId_id_uq" UNIQUE("edition_id","id"),
	CONSTRAINT "kalakriti_transport_assignment_capacity_chk" CHECK ("kalakriti_transport_assignment"."capacity" > 0),
	CONSTRAINT "kalakriti_transport_assignment_vehicleLabel_chk" CHECK (length(trim("kalakriti_transport_assignment"."vehicle_label")) > 0),
	CONSTRAINT "kalakriti_transport_assignment_driverName_chk" CHECK (length(trim("kalakriti_transport_assignment"."driver_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "kalakriti_transport_status_history" (
	"actor_user_id" text NOT NULL,
	"assignment_id" uuid NOT NULL,
	"created_at" timestamp NOT NULL,
	"edition_id" uuid NOT NULL,
	"from_status" "kalakriti_transport_status",
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"to_status" "kalakriti_transport_status" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" DROP CONSTRAINT "kalakriti_assignment_scope_chk";--> statement-breakpoint
ALTER TABLE "kalakriti_transport_assignment" ADD CONSTRAINT "kalakriti_transport_assignment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_transport_assignment" ADD CONSTRAINT "kalakriti_transport_assignment_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_transport_assignment" ADD CONSTRAINT "kalakriti_transport_assignment_edition_center_fk" FOREIGN KEY ("edition_id","center_id") REFERENCES "public"."kalakriti_center"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_transport_status_history" ADD CONSTRAINT "kalakriti_transport_status_history_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_transport_status_history" ADD CONSTRAINT "kalakriti_transport_status_history_assignment_id_kalakriti_transport_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."kalakriti_transport_assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_transport_status_history" ADD CONSTRAINT "kalakriti_transport_status_history_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_transport_status_history" ADD CONSTRAINT "kalakriti_transport_status_history_edition_assignment_fk" FOREIGN KEY ("edition_id","assignment_id") REFERENCES "public"."kalakriti_transport_assignment"("edition_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kalakriti_transport_assignment_editionId_centerId_idx" ON "kalakriti_transport_assignment" USING btree ("edition_id","center_id");--> statement-breakpoint
CREATE INDEX "kalakriti_transport_status_history_assignmentId_idx" ON "kalakriti_transport_status_history" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "kalakriti_transport_status_history_editionId_idx" ON "kalakriti_transport_status_history" USING btree ("edition_id");--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ADD CONSTRAINT "kalakriti_assignment_scope_chk" CHECK (
        ("kalakriti_assignment"."responsibility"::text IN ('edition_admin', 'volunteer_coordinator', 'overall_events_lead', 'liaison_lead', 'food_lead', 'food_member', 'transport_lead', 'logistics_lead', 'logistics_member', 'awards_lead', 'awards_member', 'venue_lead', 'venue_member', 'hospitality_lead', 'hospitality_member', 'media_member', 'fundraising_member')
          AND "kalakriti_assignment"."center_id" IS NULL
          AND "kalakriti_assignment"."competition_category_id" IS NULL
          AND "kalakriti_assignment"."competition_id" IS NULL)
        OR ("kalakriti_assignment"."responsibility"::text IN ('liaison', 'center_liaison_lead', 'liaison_volunteer', 'transport_coordinator')
          AND "kalakriti_assignment"."center_id" IS NOT NULL
          AND "kalakriti_assignment"."competition_category_id" IS NULL
          AND "kalakriti_assignment"."competition_id" IS NULL)
        OR ("kalakriti_assignment"."responsibility"::text = 'competition_category_lead'
          AND "kalakriti_assignment"."center_id" IS NULL
          AND "kalakriti_assignment"."competition_category_id" IS NOT NULL
          AND "kalakriti_assignment"."competition_id" IS NULL)
        OR ("kalakriti_assignment"."responsibility"::text IN ('competition_coordinator', 'competition_volunteer')
          AND "kalakriti_assignment"."center_id" IS NULL
          AND "kalakriti_assignment"."competition_category_id" IS NULL
          AND "kalakriti_assignment"."competition_id" IS NOT NULL)
      );