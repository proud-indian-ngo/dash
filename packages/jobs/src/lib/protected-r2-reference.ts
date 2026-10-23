import { db } from "@pi-dash/db";
import { RECEIPT_SETTINGS_CONFIG_KEY } from "@pi-dash/shared/receipts";
import { sql } from "drizzle-orm";

type ReferenceQueryExecutor = Pick<typeof db, "execute">;

function withProtectedR2ObjectLock<T>(
  r2Key: string,
  operation: (executor: ReferenceQueryExecutor) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${r2Key}, 0))`
    );
    return operation(tx);
  });
}

export async function isProtectedR2ObjectReferenced(
  r2Key: string,
  executor: ReferenceQueryExecutor = db
): Promise<boolean> {
  const rows = await executor.execute<{ referenced: boolean }>(sql`
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
      WHERE attachments @> ${JSON.stringify([{ r2Key }])}::text::jsonb
      UNION ALL
      SELECT 1 FROM kalakriti_competition_entry WHERE music_object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM kalakriti_entry_music WHERE object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM kalakriti_result_scorecard WHERE object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM kalakriti_inventory_item WHERE photo_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM governance_document WHERE object_key = ${r2Key} OR archive_object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM circular_revision WHERE object_key = ${r2Key} OR latest_object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM circular_signature WHERE object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM resolution
      WHERE status = 'issued' AND circular_id IS NOT NULL
        AND ${r2Key} LIKE '%/governance/circulars/' || circular_id::text || '/%'
      UNION ALL
      SELECT 1 FROM meeting WHERE minutes_object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM conflict_declaration WHERE object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM private.donation_filing WHERE file_object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM private.donation_certificate WHERE file_object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM grant_agreement WHERE agreement_object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM utilisation_certificate
      WHERE latest_object_key = ${r2Key} OR ca_object_key = ${r2Key} OR archive_object_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM app_config
      WHERE CASE WHEN key = ${RECEIPT_SETTINGS_CONFIG_KEY}
        THEN value::jsonb ->> 'signatureKey' END = ${r2Key}
      UNION ALL
      SELECT 1 FROM private.contribution_receipt_snapshot WHERE pdf_key = ${r2Key}
      UNION ALL
      SELECT 1 FROM private.contribution_receipt_snapshot WHERE signature_key = ${r2Key}
    ) AS referenced
  `);

  return rows[0]?.referenced ?? false;
}

export function withProtectedR2ObjectReferenceLock<T>(
  r2Key: string,
  operation: (referenced: boolean) => Promise<T>
): Promise<T> {
  return withProtectedR2ObjectLock(r2Key, async (tx) => {
    const referenced = await isProtectedR2ObjectReferenced(r2Key, tx);
    return operation(referenced);
  });
}

export function withProtectedR2ObjectDeleteLock<T>(
  r2Key: string,
  operation: () => Promise<T>
): Promise<T> {
  return withProtectedR2ObjectLock(r2Key, operation);
}
