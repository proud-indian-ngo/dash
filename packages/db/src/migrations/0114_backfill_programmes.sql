-- Assign every team and event to a programme (see docs/architecture/
-- finance-and-programmes.md section 7). Teams are matched by name; anything
-- unmatched goes to the Unallocated holding programme, which finance clears
-- before year close. Events inherit their team's programme. Re-running
-- changes nothing because only rows still on Unallocated or NULL are touched.

UPDATE "team" SET "programme_id" = CASE
  WHEN "name" ILIKE '%gubbachi%' OR "name" ILIKE '%spoken english%' OR "name" ILIKE '%teaching%' OR "name" ILIKE '%class%'
    THEN '01930000-0000-7000-8000-000000000001'
  WHEN "name" ILIKE '%kalakriti%'
    THEN '01930000-0000-7000-8000-000000000002'
  WHEN "name" ILIKE '%core team%' OR "name" ILIKE '%mumbai%' OR "name" ILIKE '%kitchen%' OR "name" ILIKE '%logistics%' OR "name" ILIKE '%outreach%'
    THEN '01930000-0000-7000-8000-000000000003'
  ELSE '01930000-0000-7000-8000-000000000009'
END::uuid
WHERE "programme_id" IS NULL;
--> statement-breakpoint
UPDATE "team_event" e
SET "programme_id" = t."programme_id"
FROM "team" t
WHERE t."id" = e."team_id"
  AND t."programme_id" IS NOT NULL
  AND e."programme_id" = '01930000-0000-7000-8000-000000000009';
--> statement-breakpoint
UPDATE "team_event" SET "programme_id" = '01930000-0000-7000-8000-000000000002'
WHERE "management_domain" = 'kalakriti'
  AND "programme_id" = '01930000-0000-7000-8000-000000000009';
