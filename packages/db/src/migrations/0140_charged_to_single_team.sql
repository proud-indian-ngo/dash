-- Phase 0 mapping for requests without an event (founder-approved, see
-- docs/architecture/finance-and-programmes.md section 6): a request the
-- backfill left on the Unallocated holding programme moves to its
-- submitter's team programme when the submitter is in exactly one team and
-- that team's programme is a real one. Everything else stays on Unallocated
-- for finance to clear. Only rows still charged straight to Unallocated with
-- no project and no event are touched, so re-running it changes nothing new.
UPDATE "reimbursement" r
SET "charged_programme_id" = t."programme_id"
FROM "team_member" m
JOIN "team" t ON t."id" = m."team_id"
WHERE m."user_id" = r."user_id"
  AND r."charged_to" = 'programme'
  AND r."charged_programme_id" = '01930000-0000-7000-8000-000000000009'
  AND r."charged_project_id" IS NULL
  AND r."event_id" IS NULL
  AND t."programme_id" IS NOT NULL
  AND t."programme_id" <> '01930000-0000-7000-8000-000000000009'
  AND (SELECT count(*) FROM "team_member" only_team WHERE only_team."user_id" = r."user_id") = 1;
--> statement-breakpoint
UPDATE "vendor_payment" v
SET "charged_programme_id" = t."programme_id"
FROM "team_member" m
JOIN "team" t ON t."id" = m."team_id"
WHERE m."user_id" = v."user_id"
  AND v."charged_to" = 'programme'
  AND v."charged_programme_id" = '01930000-0000-7000-8000-000000000009'
  AND v."charged_project_id" IS NULL
  AND v."event_id" IS NULL
  AND t."programme_id" IS NOT NULL
  AND t."programme_id" <> '01930000-0000-7000-8000-000000000009'
  AND (SELECT count(*) FROM "team_member" only_team WHERE only_team."user_id" = v."user_id") = 1;
