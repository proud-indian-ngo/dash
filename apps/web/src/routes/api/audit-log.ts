import { db } from "@pi-dash/db";
import { auditLog } from "@pi-dash/db/schema/audit-log";
import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, gte, ilike, lt, or, type SQL, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { assertServerPermission, requireSession } from "@/lib/api-auth";
import { createAuditLogGetHandler } from "@/lib/audit-log-handler";
import type { AuditLogQuery } from "@/lib/audit-query";

async function loadAuditLog({
  action,
  from,
  limit,
  offset,
  outcome,
  search,
  targetType,
  to,
}: AuditLogQuery) {
  const conditions: SQL[] = [];
  if (action) {
    conditions.push(eq(auditLog.action, action));
  }
  if (outcome) {
    conditions.push(eq(auditLog.outcome, outcome));
  }
  if (targetType) {
    conditions.push(eq(auditLog.targetType, targetType));
  }
  if (from) {
    conditions.push(gte(auditLog.attemptedAt, new Date(`${from}T00:00:00Z`)));
  }
  if (to) {
    const endExclusive = new Date(`${to}T00:00:00Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    conditions.push(lt(auditLog.attemptedAt, endExclusive));
  }
  if (search?.trim()) {
    const pattern = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(auditLog.actorName, pattern),
        ilike(auditLog.actorUserId, pattern),
        ilike(auditLog.action, pattern),
        ilike(auditLog.targetId, pattern),
        ilike(auditLog.targetType, pattern)
      ) as SQL
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [entries, countRows, actionRows, targetTypeRows] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.attemptedAt), desc(auditLog.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(where),
    db
      .selectDistinct({ action: auditLog.action })
      .from(auditLog)
      .orderBy(auditLog.action),
    db
      .selectDistinct({ targetType: auditLog.targetType })
      .from(auditLog)
      .where(sql`${auditLog.targetType} is not null`)
      .orderBy(auditLog.targetType),
  ]);

  return {
    entries,
    facets: {
      actions: actionRows.map((row) => row.action),
      targetTypes: targetTypeRows.flatMap((row) =>
        row.targetType ? [row.targetType] : []
      ),
    },
    total: countRows[0]?.total ?? 0,
  };
}

const getAuditLog = createAuditLogGetHandler({
  assertPermission: assertServerPermission,
  load: loadAuditLog,
  onLoadError: (caughtError, session) => {
    const log = createRequestLogger({ method: "GET", path: "/api/audit-log" });
    log.set({ userId: session.user.id });
    log.error(caughtError instanceof Error ? caughtError : String(caughtError));
    log.emit();
  },
  requireSession,
});

export const Route = createFileRoute("/api/audit-log")({
  server: {
    handlers: {
      GET: getAuditLog,
    },
  },
});
