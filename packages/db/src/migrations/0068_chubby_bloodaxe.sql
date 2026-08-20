ALTER TABLE "kalakriti_assignment" DROP CONSTRAINT "kalakriti_assignment_scope_chk";--> statement-breakpoint
DROP INDEX "kalakriti_assignment_overall_events_lead_uidx";--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ALTER COLUMN "responsibility" SET DATA TYPE text USING "responsibility"::text;--> statement-breakpoint
DELETE FROM "kalakriti_assignment" WHERE "responsibility" = 'transport_coordinator';--> statement-breakpoint
DROP TYPE "public"."kalakriti_responsibility";--> statement-breakpoint
CREATE TYPE "public"."kalakriti_responsibility" AS ENUM('edition_admin', 'volunteer_coordinator', 'overall_events_lead', 'competition_category_lead', 'competition_coordinator', 'competition_volunteer', 'liaison', 'liaison_lead', 'liaison_volunteer', 'food_lead', 'food_member', 'transport_lead', 'logistics_lead', 'logistics_member', 'awards_lead', 'awards_member', 'venue_lead', 'venue_member', 'hospitality_lead', 'hospitality_member', 'media_member', 'fundraising_member');--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ALTER COLUMN "responsibility" SET DATA TYPE "public"."kalakriti_responsibility" USING "responsibility"::"public"."kalakriti_responsibility";--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_assignment_overall_events_lead_uidx" ON "kalakriti_assignment" USING btree ("edition_id") WHERE "kalakriti_assignment"."responsibility" = 'overall_events_lead';--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ADD CONSTRAINT "kalakriti_assignment_scope_chk" CHECK (
        ("kalakriti_assignment"."responsibility"::text IN ('edition_admin', 'volunteer_coordinator', 'overall_events_lead', 'food_lead', 'food_member', 'transport_lead', 'logistics_lead', 'logistics_member', 'awards_lead', 'awards_member', 'venue_lead', 'venue_member', 'hospitality_lead', 'hospitality_member', 'media_member', 'fundraising_member')
          AND "kalakriti_assignment"."center_id" IS NULL
          AND "kalakriti_assignment"."competition_category_id" IS NULL
          AND "kalakriti_assignment"."competition_id" IS NULL)
        OR ("kalakriti_assignment"."responsibility"::text IN ('liaison', 'liaison_lead', 'liaison_volunteer')
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