import { db } from "@pi-dash/db";
import { auditLog } from "@pi-dash/db/schema/audit-log";

const AUDIT_ENTRY_ID = "00000000-0000-4000-8000-000000000001";

export async function ensureAuditLogEntry(
  superAdminUserId: string
): Promise<void> {
  const existing = await db.query.auditLog.findFirst({
    columns: { id: true },
    where: (table, ops) => ops.eq(table.id, AUDIT_ENTRY_ID),
  });
  if (existing) {
    return;
  }

  await db.insert(auditLog).values({
    action: "e2e.audit.seed",
    actorName: "Test Super Admin",
    actorRole: "super_admin",
    actorUserId: superAdminUserId,
    completedAt: new Date(),
    id: AUDIT_ENTRY_ID,
    metadata: { source: "e2e" },
    outcome: "success",
    targetId: superAdminUserId,
    targetType: "user",
    traceId: "00000000000000000000000000000001",
  });
}
