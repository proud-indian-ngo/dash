-- Every reimbursement and vendor payment belongs to one programme (see
-- docs/architecture/finance-and-programmes.md section 3.6). Existing requests
-- take the programme of their event; requests without an event take the
-- programme of the submitter's team when the submitter belongs to exactly one
-- team; everything else goes to the Unallocated holding programme, which
-- finance clears before year close.

ALTER TABLE "reimbursement" ADD COLUMN "programme_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD COLUMN "programme_id" uuid;--> statement-breakpoint
UPDATE "reimbursement" r
SET "programme_id" = e."programme_id"
FROM "team_event" e
WHERE r."event_id" = e."id"
  AND r."programme_id" IS NULL;--> statement-breakpoint
UPDATE "vendor_payment" vp
SET "programme_id" = e."programme_id"
FROM "team_event" e
WHERE vp."event_id" = e."id"
  AND vp."programme_id" IS NULL;--> statement-breakpoint
UPDATE "reimbursement" r
SET "programme_id" = t."programme_id"
FROM (
  SELECT "user_id", min("team_id"::text)::uuid AS "team_id"
  FROM "team_member"
  GROUP BY "user_id"
  HAVING count(*) = 1
) m
JOIN "team" t ON t."id" = m."team_id"
WHERE r."user_id" = m."user_id"
  AND t."programme_id" IS NOT NULL
  AND r."programme_id" IS NULL;--> statement-breakpoint
UPDATE "vendor_payment" vp
SET "programme_id" = t."programme_id"
FROM (
  SELECT "user_id", min("team_id"::text)::uuid AS "team_id"
  FROM "team_member"
  GROUP BY "user_id"
  HAVING count(*) = 1
) m
JOIN "team" t ON t."id" = m."team_id"
WHERE vp."user_id" = m."user_id"
  AND t."programme_id" IS NOT NULL
  AND vp."programme_id" IS NULL;--> statement-breakpoint
UPDATE "reimbursement" SET "programme_id" = '01930000-0000-7000-8000-000000000009'::uuid
WHERE "programme_id" IS NULL;--> statement-breakpoint
UPDATE "vendor_payment" SET "programme_id" = '01930000-0000-7000-8000-000000000009'::uuid
WHERE "programme_id" IS NULL;--> statement-breakpoint
ALTER TABLE "reimbursement" ALTER COLUMN "programme_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_payment" ALTER COLUMN "programme_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_programme_id_programme_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programme"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment" ADD CONSTRAINT "vendor_payment_programme_id_programme_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programme"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reimbursement_programmeId_idx" ON "reimbursement" USING btree ("programme_id");--> statement-breakpoint
CREATE INDEX "vendor_payment_programmeId_idx" ON "vendor_payment" USING btree ("programme_id");
