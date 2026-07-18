import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { kalakritiAuditEntry } from "@pi-dash/db/schema/kalakriti";
import { and, count, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type {
  KalakritiAuditDomain,
  KalakritiAuditScope,
} from "@/lib/kalakriti-audit-policy";
import { sanitizeKalakritiAuditMetadata } from "@/lib/kalakriti-audit-policy";

export interface KalakritiAuditPageInput {
  domain: KalakritiAuditDomain | null;
  editionId: string;
  limit: number;
  offset: number;
  scope: KalakritiAuditScope;
  snapshotVersion: string | null;
}

function categoryCondition(categoryIds: string[]): SQL {
  const metadataConditions = categoryIds.flatMap((categoryId) => [
    sql`${kalakritiAuditEntry.metadata} ->> 'competitionCategoryId' = ${categoryId}`,
    sql`${kalakritiAuditEntry.metadata} -> 'competitionCategoryIds' ? ${categoryId}`,
  ]);
  return or(
    and(
      eq(kalakritiAuditEntry.targetType, "competition_category"),
      inArray(kalakritiAuditEntry.targetId, categoryIds)
    ),
    ...metadataConditions
  ) as SQL;
}

export function buildKalakritiAuditScopeCondition(
  scope: KalakritiAuditScope,
  requestedDomain: KalakritiAuditDomain | null
): SQL | null {
  if (requestedDomain && !scope.domains.includes(requestedDomain)) {
    return null;
  }
  if (scope.fullEdition) {
    return requestedDomain
      ? eq(kalakritiAuditEntry.domain, requestedDomain)
      : sql`true`;
  }

  const domains = requestedDomain ? [requestedDomain] : scope.domains;
  const categoryScopedDomains = new Set(scope.categoryScopedDomains);
  const conditions = domains.flatMap((domain) => {
    if (categoryScopedDomains.has(domain)) {
      return scope.competitionCategoryIds.length > 0
        ? [
            and(
              eq(kalakritiAuditEntry.domain, domain),
              categoryCondition(scope.competitionCategoryIds)
            ) as SQL,
          ]
        : [];
    }
    return [eq(kalakritiAuditEntry.domain, domain)];
  });
  return conditions.length > 0 ? (or(...conditions) as SQL) : null;
}

export function buildKalakritiAuditSnapshotCondition(snapshotVersion: string) {
  const auditTransactionId = sql.raw(
    '"kalakriti_audit_entry"."xmin"::text::xid8'
  );
  return sql`pg_visible_in_snapshot(${auditTransactionId}, ${snapshotVersion}::pg_snapshot)`;
}

export function buildKalakritiAuditWhereCondition(
  editionId: string,
  scope: KalakritiAuditScope,
  requestedDomain: KalakritiAuditDomain | null,
  snapshotVersion: string
): SQL | null {
  const scopeCondition = buildKalakritiAuditScopeCondition(
    scope,
    requestedDomain
  );
  if (!scopeCondition) {
    return null;
  }
  return and(
    eq(kalakritiAuditEntry.editionId, editionId),
    scopeCondition,
    buildKalakritiAuditSnapshotCondition(snapshotVersion)
  ) as SQL;
}

export function buildKalakritiAuditItemsQuery(
  where: SQL,
  limit: number,
  offset: number
) {
  return db
    .select({
      action: kalakritiAuditEntry.action,
      actorName: user.name,
      actorUserId: kalakritiAuditEntry.actorUserId,
      createdAt: kalakritiAuditEntry.createdAt,
      domain: kalakritiAuditEntry.domain,
      id: kalakritiAuditEntry.id,
      metadata: kalakritiAuditEntry.metadata,
      reason: kalakritiAuditEntry.reason,
      targetId: kalakritiAuditEntry.targetId,
      targetType: kalakritiAuditEntry.targetType,
    })
    .from(kalakritiAuditEntry)
    .leftJoin(user, eq(user.id, kalakritiAuditEntry.actorUserId))
    .where(where)
    .orderBy(desc(kalakritiAuditEntry.createdAt), desc(kalakritiAuditEntry.id))
    .limit(limit)
    .offset(offset);
}

export async function getKalakritiAuditPage(input: KalakritiAuditPageInput) {
  const scopeCondition = buildKalakritiAuditScopeCondition(
    input.scope,
    input.domain
  );
  if (!scopeCondition) {
    return null;
  }
  const snapshotVersion =
    input.snapshotVersion ??
    (await db
      .execute<{ snapshotVersion: string }>(
        sql`SELECT pg_current_snapshot()::text AS "snapshotVersion"`
      )
      .then((rows) => rows[0]?.snapshotVersion));
  if (!snapshotVersion) {
    throw new Error("Could not establish an audit pagination snapshot");
  }
  const where = and(
    eq(kalakritiAuditEntry.editionId, input.editionId),
    scopeCondition,
    buildKalakritiAuditSnapshotCondition(snapshotVersion)
  ) as SQL;
  const [items, totals] = await Promise.all([
    buildKalakritiAuditItemsQuery(where, input.limit, input.offset),
    db.select({ total: count() }).from(kalakritiAuditEntry).where(where),
  ]);

  return {
    items: items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      metadata: sanitizeKalakritiAuditMetadata(item.metadata),
    })),
    snapshotVersion,
    total: totals[0]?.total ?? 0,
  };
}
