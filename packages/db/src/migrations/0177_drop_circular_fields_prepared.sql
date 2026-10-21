DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT ON (cr."circular_id") cr."circular_id", cr."fields_prepared"
      FROM "circular_revision" cr
      ORDER BY cr."circular_id", cr."revision" DESC
    ) latest
    WHERE NOT latest."fields_prepared"
      AND EXISTS (
        SELECT 1 FROM "resolution" r
        WHERE r."circular_id" = latest."circular_id" AND r."status" = 'issued'
      )
  ) THEN
    RAISE EXCEPTION 'An open circular was issued without prepared signature fields. Withdraw and reissue those circulars, then run this migration again.';
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'pi_dash_public' AND schemaname = 'public' AND tablename = 'circular_revision'
  ) THEN
    ALTER PUBLICATION pi_dash_public DROP TABLE "public"."circular_revision";
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "circular_revision" DROP COLUMN "fields_prepared";
