-- Cost centres replace the city enum (docs/architecture/finance-and-
-- programmes.md, "Cost centres"). 0155 added the nullable cost_centre_id
-- columns; this fills them from the old city, and 0157 drops the city
-- columns and the reimbursement_city enum.
--
-- Rules:
-- - First, occurrences of a Mumbai series that the old materialisers saved
--   as bangalore (they never copied the city) take their series' city, so
--   they, and the claims linked to them, stay Mumbai. Only rows nobody has
--   touched since (created_at = updated_at; materialising sets both to the
--   same instant) under a series not edited since they were made (series
--   updated_at <= occurrence created_at, so the series was already Mumbai
--   then): a series moved to Mumbai with "all", or an occurrence set to
--   Bangalore on purpose, is left alone. Recapped or cancelled occurrences
--   are left too (both bump updated_at); DEPLOYMENT.md lists every
--   candidate to check by hand.
-- - Every event takes its city's cost centre (bangalore -> BLR, mumbai -> MUM).
-- - A reimbursement or vendor payment linked to an event stores no cost
--   centre: it reads its event's, so the two can never drift. Where the
--   request's own city differed from its event's, the event wins.
-- - A request with no event, and every advance payment (they have no event),
--   keeps its own city as its cost centre. Older reimbursements and advances
--   that never recorded a city stay null.
--
-- What it changed is kept in app_config `cost_centre_backfill` (JSON:
-- occurrencesFixed, requestsOnFixedOccurrences, and the request-vs-event
-- city mismatches by table, counted after the occurrence fix), since the
-- migrator does not surface NOTICEs. DEPLOYMENT.md has the query to count
-- the mismatches before deploying.
--
-- Idempotent: the reference rows are inserted only when missing, the
-- occurrence fix and each update only touch rows still to change, and the
-- counts row keeps the first run's figures.

INSERT INTO "cost_centre" ("id", "code", "name", "state_ut", "active", "created_at", "updated_at") VALUES
  ('01930000-0000-7000-8000-000000000101', 'BLR', 'Bangalore', 'Karnataka', true, now(), now()),
  ('01930000-0000-7000-8000-000000000102', 'MUM', 'Mumbai', 'Maharashtra', false, now(), now())
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DO $$
DECLARE
  occurrences_fixed integer;
  requests_on_fixed integer;
  reimbursement_mismatches integer;
  vendor_payment_mismatches integer;
BEGIN
  SELECT
    (SELECT count(*) FROM "reimbursement" r WHERE r."event_id" IN (
      SELECT c."id" FROM "team_event" c JOIN "team_event" p ON p."id" = c."series_id"
      WHERE c."city" = 'bangalore' AND p."city" = 'mumbai'
        AND c."created_at" = c."updated_at" AND p."updated_at" <= c."created_at"))
    + (SELECT count(*) FROM "vendor_payment" v WHERE v."event_id" IN (
      SELECT c."id" FROM "team_event" c JOIN "team_event" p ON p."id" = c."series_id"
      WHERE c."city" = 'bangalore' AND p."city" = 'mumbai'
        AND c."created_at" = c."updated_at" AND p."updated_at" <= c."created_at"))
  INTO requests_on_fixed;
  UPDATE "team_event" c SET "city" = p."city"
    FROM "team_event" p
    WHERE p."id" = c."series_id" AND c."city" = 'bangalore' AND p."city" = 'mumbai'
      AND c."created_at" = c."updated_at" AND p."updated_at" <= c."created_at";
  GET DIAGNOSTICS occurrences_fixed = ROW_COUNT;
  SELECT count(*) INTO reimbursement_mismatches
    FROM "reimbursement" r
    JOIN "team_event" e ON e."id" = r."event_id"
    WHERE r."city" IS NOT NULL AND r."city" <> e."city";
  SELECT count(*) INTO vendor_payment_mismatches
    FROM "vendor_payment" v
    JOIN "team_event" e ON e."id" = v."event_id"
    WHERE v."city" <> e."city";
  INSERT INTO "app_config" ("key", "value", "updated_at") VALUES (
    'cost_centre_backfill',
    json_build_object(
      'occurrencesFixed', occurrences_fixed,
      'requestsOnFixedOccurrences', requests_on_fixed,
      'mismatches', json_build_object(
        'reimbursement', reimbursement_mismatches,
        'vendorPayment', vendor_payment_mismatches
      )
    )::text,
    now()
  ) ON CONFLICT ("key") DO NOTHING;
END $$;
--> statement-breakpoint
UPDATE "team_event" SET "cost_centre_id" = CASE "city"
    WHEN 'mumbai' THEN '01930000-0000-7000-8000-000000000102'
    ELSE '01930000-0000-7000-8000-000000000101'
  END::uuid
WHERE "cost_centre_id" IS NULL;
--> statement-breakpoint
UPDATE "reimbursement" SET "cost_centre_id" = CASE "city"
    WHEN 'mumbai' THEN '01930000-0000-7000-8000-000000000102'
    ELSE '01930000-0000-7000-8000-000000000101'
  END::uuid
WHERE "cost_centre_id" IS NULL AND "event_id" IS NULL AND "city" IS NOT NULL;
--> statement-breakpoint
UPDATE "vendor_payment" SET "cost_centre_id" = CASE "city"
    WHEN 'mumbai' THEN '01930000-0000-7000-8000-000000000102'
    ELSE '01930000-0000-7000-8000-000000000101'
  END::uuid
WHERE "cost_centre_id" IS NULL AND "event_id" IS NULL;
--> statement-breakpoint
UPDATE "advance_payment" SET "cost_centre_id" = CASE "city"
    WHEN 'mumbai' THEN '01930000-0000-7000-8000-000000000102'
    ELSE '01930000-0000-7000-8000-000000000101'
  END::uuid
WHERE "cost_centre_id" IS NULL AND "city" IS NOT NULL;
