import { db } from "@pi-dash/db";
import { sql } from "drizzle-orm";

export async function isProtectedR2ObjectReferenced(
  r2Key: string
): Promise<boolean> {
  const rows = await db.execute<{ referenced: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM reimbursement_attachment WHERE object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM advance_payment_attachment WHERE object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM vendor_payment_attachment WHERE object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM vendor_payment_transaction_attachment WHERE object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM reimbursement WHERE approval_screenshot_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM advance_payment WHERE approval_screenshot_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM vendor_payment WHERE approval_screenshot_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM event_photo WHERE r2_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM scheduled_message
      WHERE attachments @> ${JSON.stringify([{ r2Key }])}::jsonb
    ) AS referenced
  `);

  return rows[0]?.referenced ?? false;
}
