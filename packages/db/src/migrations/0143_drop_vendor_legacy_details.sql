DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "private"."vendor_legacy_details") THEN
    RAISE EXCEPTION 'vendor_legacy_details still has rows; run the vendor details backfill before this migration';
  END IF;
END $$;--> statement-breakpoint
DROP TABLE "private"."vendor_legacy_details" CASCADE;
