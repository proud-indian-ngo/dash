CREATE TYPE "public"."reimbursement_attachment_purpose" AS ENUM('receipt', 'payment_proof', 'voucher', 'signed_voucher', 'payee_signature');--> statement-breakpoint
ALTER TABLE "reimbursement_attachment" ADD COLUMN "purpose" "reimbursement_attachment_purpose" DEFAULT 'receipt' NOT NULL;--> statement-breakpoint
-- Kept payment proof keeps its approval screenshot key.
UPDATE "reimbursement_attachment" SET "purpose" = 'payment_proof'
WHERE "object_key" LIKE '%/approval-screenshots/%';--> statement-breakpoint
-- Generated cash vouchers live under vouchers/.
UPDATE "reimbursement_attachment" a SET "purpose" = 'voucher'
WHERE a."purpose" = 'receipt' AND (
  a."object_key" LIKE '%/vouchers/%'
  OR EXISTS (SELECT 1 FROM "reimbursement_line_item" li WHERE li."voucher_attachment_id" = a."id")
);--> statement-breakpoint
-- Payee signatures: linked, or named by the history of their collection.
UPDATE "reimbursement_attachment" a SET "purpose" = 'payee_signature'
WHERE a."purpose" = 'receipt' AND (
  EXISTS (SELECT 1 FROM "reimbursement_line_item" li WHERE li."payee_signature_attachment_id" = a."id")
  OR EXISTS (
    SELECT 1 FROM "reimbursement_history" h
    WHERE h."reimbursement_id" = a."reimbursement_id"
      AND h."note" LIKE 'Payee signature collected%'
      AND (h."metadata"->>'attachmentId' = a."id"::text OR h."metadata"->>'replacedAttachmentId' = a."id"::text)
  )
);--> statement-breakpoint
-- Signed vouchers: linked, or uploaded with their history row. History
-- recorded no IDs before, and an edit re-saves files with a new time, so on
-- a request that ever took a signed voucher every other file added since
-- the first one is treated as one too: a lead never sees it.
UPDATE "reimbursement_attachment" a SET "purpose" = 'signed_voucher'
WHERE a."purpose" = 'receipt' AND (
  EXISTS (SELECT 1 FROM "reimbursement_line_item" li WHERE li."signed_voucher_attachment_id" = a."id")
  OR EXISTS (
    SELECT 1 FROM "reimbursement_history" h
    WHERE h."reimbursement_id" = a."reimbursement_id"
      AND h."note" IN ('Signed voucher uploaded', 'Signed voucher replaced')
      AND h."created_at" <= a."created_at"
  )
);--> statement-breakpoint
ALTER TABLE "reimbursement_attachment" ALTER COLUMN "purpose" DROP DEFAULT;
