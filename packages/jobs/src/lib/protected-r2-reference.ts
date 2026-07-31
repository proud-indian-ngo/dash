import { db } from "@pi-dash/db";
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
      WHERE attachments @> ${JSON.stringify([{ r2Key }])}::jsonb
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
