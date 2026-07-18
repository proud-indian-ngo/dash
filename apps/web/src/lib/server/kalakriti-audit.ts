import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAuditEntry,
  kalakritiCompetition,
  kalakritiCompetitionSession,
} from "@pi-dash/db/schema/kalakriti";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
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
  snapshot: null | { createdAt: Date; id: string };
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
    and(
      eq(kalakritiAuditEntry.targetType, "competition"),
      inArray(
        kalakritiAuditEntry.targetId,
        db
          .select({ id: kalakritiCompetition.id })
          .from(kalakritiCompetition)
          .where(
            inArray(kalakritiCompetition.competitionCategoryId, categoryIds)
          )
      )
    ),
    and(
      eq(kalakritiAuditEntry.targetType, "competition_session"),
      inArray(
        kalakritiAuditEntry.targetId,
        db
          .select({ id: kalakritiCompetitionSession.id })
          .from(kalakritiCompetitionSession)
          .innerJoin(
            kalakritiCompetition,
            eq(
              kalakritiCompetition.id,
              kalakritiCompetitionSession.competitionId
            )
          )
          .where(
            inArray(kalakritiCompetition.competitionCategoryId, categoryIds)
          )
      )
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

function snapshotCondition(snapshot: KalakritiAuditPageInput["snapshot"]) {
  if (!snapshot) {
    return;
  }
  return or(
    lt(kalakritiAuditEntry.createdAt, snapshot.createdAt),
    and(
      eq(kalakritiAuditEntry.createdAt, snapshot.createdAt),
      lte(kalakritiAuditEntry.id, snapshot.id)
    )
  );
}

export async function getKalakritiAuditPage(input: KalakritiAuditPageInput) {
  const scopeCondition = buildKalakritiAuditScopeCondition(
    input.scope,
    input.domain
  );
  if (!scopeCondition) {
    return null;
  }
  const baseCondition = and(
    eq(kalakritiAuditEntry.editionId, input.editionId),
    scopeCondition
  );
  const snapshot =
    input.snapshot ??
    (await db
      .select({
        createdAt: kalakritiAuditEntry.createdAt,
        id: kalakritiAuditEntry.id,
      })
      .from(kalakritiAuditEntry)
      .where(baseCondition)
      .orderBy(
        desc(kalakritiAuditEntry.createdAt),
        desc(kalakritiAuditEntry.id)
      )
      .limit(1)
      .then((rows) => rows[0] ?? null));

  if (!snapshot) {
    return { items: [], snapshot: null, total: 0 };
  }
  const where = and(baseCondition, snapshotCondition(snapshot));
  const [items, totals] = await Promise.all([
    db
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
      .orderBy(
        desc(kalakritiAuditEntry.createdAt),
        desc(kalakritiAuditEntry.id)
      )
      .limit(input.limit)
      .offset(input.offset),
    db.select({ total: count() }).from(kalakritiAuditEntry).where(where),
  ]);

  return {
    items: items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      metadata: sanitizeKalakritiAuditMetadata(item.metadata),
    })),
    snapshot: {
      createdAt: snapshot.createdAt.toISOString(),
      id: snapshot.id,
    },
    total: totals[0]?.total ?? 0,
  };
}
