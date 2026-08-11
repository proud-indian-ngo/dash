ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'volunteer_coordinator' BEFORE 'overall_events_lead';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'competition_category_lead';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'competition_coordinator';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'competition_volunteer';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'liaison';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'food_lead';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'food_member';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'transport_lead';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'transport_coordinator';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'logistics_lead';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'logistics_member';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'awards_lead';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'awards_member';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'venue_lead';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'venue_member';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'hospitality_lead';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'hospitality_member';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'media_member';--> statement-breakpoint
ALTER TYPE "public"."kalakriti_responsibility" ADD VALUE 'fundraising_member';--> statement-breakpoint
DROP INDEX "kalakriti_assignment_membership_responsibility_uidx";--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ADD COLUMN "center_id" uuid;--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ADD COLUMN "competition_category_id" uuid;--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ADD COLUMN "competition_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_assignment_edition_scope_uidx" ON "kalakriti_assignment" USING btree ("membership_id","responsibility") WHERE "kalakriti_assignment"."center_id" IS NULL AND "kalakriti_assignment"."competition_category_id" IS NULL AND "kalakriti_assignment"."competition_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_assignment_center_scope_uidx" ON "kalakriti_assignment" USING btree ("membership_id","responsibility","center_id") WHERE "kalakriti_assignment"."center_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_assignment_category_scope_uidx" ON "kalakriti_assignment" USING btree ("membership_id","responsibility","competition_category_id") WHERE "kalakriti_assignment"."competition_category_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_assignment_competition_scope_uidx" ON "kalakriti_assignment" USING btree ("membership_id","responsibility","competition_id") WHERE "kalakriti_assignment"."competition_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "kalakriti_assignment_primary_uidx" ON "kalakriti_assignment" USING btree ("membership_id") WHERE "kalakriti_assignment"."is_primary" = true;--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ADD CONSTRAINT "kalakriti_assignment_scope_chk" CHECK (
        ("kalakriti_assignment"."responsibility"::text IN ('edition_admin', 'volunteer_coordinator', 'overall_events_lead', 'food_lead', 'food_member', 'transport_lead', 'logistics_lead', 'logistics_member', 'awards_lead', 'awards_member', 'venue_lead', 'venue_member', 'hospitality_lead', 'hospitality_member', 'media_member', 'fundraising_member')
          AND "kalakriti_assignment"."center_id" IS NULL
          AND "kalakriti_assignment"."competition_category_id" IS NULL
          AND "kalakriti_assignment"."competition_id" IS NULL)
        OR ("kalakriti_assignment"."responsibility"::text IN ('liaison', 'transport_coordinator')
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