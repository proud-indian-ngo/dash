-- Reference rows for the finance dimensions introduced in 0111. IDs are fixed
-- (see PROGRAMME_IDS, COST_CENTRE_IDS and GENERAL_FUND_ID in
-- packages/shared/src/constants.ts) so application code and seeds can refer
-- to them. Every insert ignores conflicts, so re-running changes nothing.

INSERT INTO "programme" ("id", "code", "name", "cause", "description", "sort_order", "active", "created_at", "updated_at") VALUES
  ('01930000-0000-7000-8000-000000000001', 'EDU', 'Education', 'education', 'Classes and learning support for children: art, maths, spoken English.', 10, true, now(), now()),
  ('01930000-0000-7000-8000-000000000002', 'ART', 'Arts and culture', 'arts', 'Kalakriti and other arts programmes.', 20, true, now(), now()),
  ('01930000-0000-7000-8000-000000000003', 'COM', 'Community support', 'community', 'Distribution drives, outings, elder care, environment and corporate engagement days.', 30, true, now(), now()),
  ('01930000-0000-7000-8000-000000000009', 'UNALLOC', 'Unallocated', NULL, 'Holding programme for legacy records with no programme; finance clears it before year close.', 900, true, now(), now())
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "cost_centre" ("id", "code", "name", "state_ut", "active", "created_at", "updated_at") VALUES
  ('01930000-0000-7000-8000-000000000101', 'BLR', 'Bangalore', 'Karnataka', true, now(), now()),
  ('01930000-0000-7000-8000-000000000102', 'MUM', 'Mumbai', 'Maharashtra', false, now(), now())
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "fund" ("id", "code", "name", "description", "source", "restriction", "active", "created_at", "updated_at") VALUES
  ('01930000-0000-7000-8000-000000000201', 'GEN', 'General Fund (Domestic)', 'Unrestricted domestic funds.', 'domestic', 'unrestricted', true, now(), now())
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "fiscal_year" ("id", "label", "starts_on", "ends_on") VALUES
  ('01930000-0000-7000-8000-000000000301', '2024-25', '2024-04-01', '2025-03-31'),
  ('01930000-0000-7000-8000-000000000302', '2025-26', '2025-04-01', '2026-03-31'),
  ('01930000-0000-7000-8000-000000000303', '2026-27', '2026-04-01', '2027-03-31'),
  ('01930000-0000-7000-8000-000000000304', '2027-28', '2027-04-01', '2028-03-31')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "fiscal_period" ("id", "fiscal_year_id", "month", "starts_on", "ends_on")
SELECT
  ('01930000-0000-7000-8000-0000004' || lpad((row_number() over (order by fy."starts_on", m))::text, 5, '0'))::uuid,
  fy."id",
  m,
  (fy."starts_on" + ((m - 1) || ' months')::interval)::date,
  (fy."starts_on" + (m || ' months')::interval - interval '1 day')::date
FROM "fiscal_year" fy
CROSS JOIN generate_series(1, 12) AS m
WHERE fy."id" IN (
  '01930000-0000-7000-8000-000000000301',
  '01930000-0000-7000-8000-000000000302',
  '01930000-0000-7000-8000-000000000303',
  '01930000-0000-7000-8000-000000000304'
)
ON CONFLICT ("fiscal_year_id", "month") DO NOTHING;
--> statement-breakpoint
INSERT INTO "app_config" ("key", "value", "updated_at")
VALUES ('finance_threshold_default_paise', '1000000', now())
ON CONFLICT ("key") DO NOTHING;
