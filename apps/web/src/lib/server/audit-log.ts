import { db } from "@pi-dash/db";
import { auditLog } from "@pi-dash/db/schema/audit-log";
import { and, desc, eq, gte, ilike, lt, or, type SQL, sql } from "drizzle-orm";

import type { AuditLogQuery } from "../audit-query";

export function buildAuditLogQueries({
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
  return {
    entries: db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.attemptedAt), desc(auditLog.id))
      .limit(limit)
      .offset(offset),
    count: db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(where),
    facets: db
      .select({
        action: sql<string | null>`${auditLog.action}`,
        targetType: auditLog.targetType,
        // GROUPING is zero for action groups and one for target-type groups.
        actionGroup: sql<number>`grouping(${auditLog.action})`,
      })
      .from(auditLog)
      .groupBy(
        sql`grouping sets ((${auditLog.action}), (${auditLog.targetType}))`
      )
      .orderBy(auditLog.action, auditLog.targetType),
  };
}

export async function loadAuditLog(input: AuditLogQuery) {
  const queries = buildAuditLogQueries(input);
  const [entries, countRows, facetRows] = await Promise.all([
    queries.entries,
    queries.count,
    queries.facets,
  ]);

  return {
    entries,
    facets: {
      actions: facetRows.flatMap((row) =>
        row.actionGroup === 0 && row.action !== null ? [row.action] : []
      ),
      targetTypes: facetRows.flatMap((row) =>
        row.actionGroup === 1 && row.targetType ? [row.targetType] : []
      ),
    },
    total: countRows[0]?.total ?? 0,
  };
}
