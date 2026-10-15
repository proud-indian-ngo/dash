-- Backfill "Charged to" on every existing reimbursement and vendor payment
-- (see docs/architecture/finance-and-programmes.md, section 3.6). A request
-- linked to an event is charged to that event, whose programme it already
-- showed. A request without an event is charged to the Unallocated holding
-- programme for finance to clear: the Phase 0 "submitter's single team"
-- mapping was never implemented, so nothing better is known. Only rows still
-- without a value are touched, so re-running it changes nothing.
UPDATE "reimbursement" SET "charged_to" = 'event'
WHERE "charged_to" IS NULL AND "event_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "reimbursement"
SET "charged_to" = 'programme',
  "charged_programme_id" = '01930000-0000-7000-8000-000000000009'
WHERE "charged_to" IS NULL AND "event_id" IS NULL;
--> statement-breakpoint
UPDATE "vendor_payment" SET "charged_to" = 'event'
WHERE "charged_to" IS NULL AND "event_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "vendor_payment"
SET "charged_to" = 'programme',
  "charged_programme_id" = '01930000-0000-7000-8000-000000000009'
WHERE "charged_to" IS NULL AND "event_id" IS NULL;
