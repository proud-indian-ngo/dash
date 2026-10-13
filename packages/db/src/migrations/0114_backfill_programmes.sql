-- Assign every team and event to a programme (see docs/architecture/
-- finance-and-programmes.md section 7). Teams are matched by name; anything
-- unmatched goes to the Unallocated holding programme, which finance clears
-- before year close. Kalakriti-managed events always belong to Arts and
-- culture; every other event inherits its team's programme. The two known
-- manual retags (one Mumbai-tagged spoken-English event, and the Mumbai
-- engagements that belong to Education) are left for the Phase 0 mapping
-- script. This runs once; it is not safe to re-run after people have set
-- programmes by hand, because it only looks at rows still on NULL or
-- Unallocated and would reassign deliberate choices of those values.

UPDATE "team" SET "programme_id" = CASE
  WHEN "name" ILIKE '%kalakriti%'
    THEN '01930000-0000-7000-8000-000000000002'
  WHEN "name" ILIKE 'gubbachi%' OR "name" ILIKE 'pi center spoken english%' OR "name" ILIKE 'teaching'
    THEN '01930000-0000-7000-8000-000000000001'
  WHEN "name" ILIKE 'core team' OR "name" ILIKE 'mumbai team' OR "name" ILIKE 'kitchen' OR "name" ILIKE 'logistics' OR "name" ILIKE 'events & outreach'
    THEN '01930000-0000-7000-8000-000000000003'
  ELSE '01930000-0000-7000-8000-000000000009'
END::uuid
WHERE "programme_id" IS NULL;
--> statement-breakpoint
UPDATE "team_event" SET "programme_id" = '01930000-0000-7000-8000-000000000002'
WHERE "management_domain" = 'kalakriti';
--> statement-breakpoint
UPDATE "team_event" e
SET "programme_id" = t."programme_id"
FROM "team" t
WHERE t."id" = e."team_id"
  AND t."programme_id" IS NOT NULL
  AND e."management_domain" IS DISTINCT FROM 'kalakriti'
  AND e."programme_id" = '01930000-0000-7000-8000-000000000009';
