ALTER TABLE "kalakriti_assignment" DROP CONSTRAINT "kalakriti_assignment_scope_chk";--> statement-breakpoint
DELETE FROM "kalakriti_assignment"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id",
      ROW_NUMBER() OVER (
        PARTITION BY "membership_id"
        ORDER BY "is_primary" DESC, "created_at" ASC, "id" ASC
      ) AS rn
    FROM "kalakriti_assignment"
    WHERE "responsibility" = 'liaison_lead'
  ) ranked
  WHERE rn > 1
);--> statement-breakpoint
UPDATE "kalakriti_assignment" SET "center_id" = NULL WHERE "responsibility" = 'liaison_lead';--> statement-breakpoint
ALTER TABLE "kalakriti_assignment" ADD CONSTRAINT "kalakriti_assignment_scope_chk" CHECK (
        ("kalakriti_assignment"."responsibility"::text IN ('edition_admin', 'volunteer_coordinator', 'overall_events_lead', 'liaison_lead', 'food_lead', 'food_member', 'transport_lead', 'logistics_lead', 'logistics_member', 'awards_lead', 'awards_member', 'venue_lead', 'venue_member', 'hospitality_lead', 'hospitality_member', 'media_member', 'fundraising_member')
          AND "kalakriti_assignment"."center_id" IS NULL
          AND "kalakriti_assignment"."competition_category_id" IS NULL
          AND "kalakriti_assignment"."competition_id" IS NULL)
        OR ("kalakriti_assignment"."responsibility"::text IN ('liaison', 'liaison_volunteer')
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