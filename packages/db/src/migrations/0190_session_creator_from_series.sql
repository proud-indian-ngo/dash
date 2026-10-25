-- A volunteer whose interest or join created a recurring session was recorded
-- as its creator, which kept their account from being deleted and sent them
-- the organiser's reminders. Give those sessions the series' creator.
UPDATE "team_event" AS session
SET "created_by" = series."created_by"
FROM "team_event" AS series
WHERE session."series_id" = series."id"
  AND session."created_by" <> series."created_by"
  AND (
    EXISTS (
      SELECT 1 FROM "event_interest"
      WHERE "event_interest"."event_id" = session."id"
        AND "event_interest"."user_id" = session."created_by"
    )
    OR EXISTS (
      SELECT 1 FROM "team_event_member"
      WHERE "team_event_member"."event_id" = session."id"
        AND "team_event_member"."user_id" = session."created_by"
    )
  );
