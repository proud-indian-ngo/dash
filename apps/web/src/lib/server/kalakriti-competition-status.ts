import { db } from "@pi-dash/db";
import {
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionDivision,
  kalakritiCompetitionEntry,
  kalakritiCompetitionSession,
  kalakritiEntryMember,
  kalakritiGuardianCenter,
  kalakritiOperation,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import { kalakritiResult } from "@pi-dash/db/schema/kalakriti-results";
import {
  and,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { deriveCompetitionStatus } from "@/lib/kalakriti-competition-status";
import { canAccessKalakritiEntries } from "@/lib/kalakriti-entry-policy";
import {
  resolveKalakritiRegistrationScopes,
  type KalakritiRegistrationScope,
} from "@/lib/kalakriti-registration-scope-policy";
import { buildKalakritiRegistrationDashboardCompetitionCondition } from "@/lib/server/kalakriti-registration-dashboard";

type StatusDatabase = Pick<typeof db, "select">;

function divisionScope(
  scope: KalakritiRegistrationScope,
  editionId: string,
  database: StatusDatabase
): SQL {
  if (scope.kind !== "center") {
    return buildKalakritiRegistrationDashboardCompetitionCondition(scope);
  }
  const historicallyEntered = exists(
    database
      .select({ id: kalakritiCompetitionEntry.id })
      .from(kalakritiCompetitionEntry)
      .where(
        and(
          eq(kalakritiCompetitionEntry.editionId, editionId),
          eq(
            kalakritiCompetitionEntry.divisionId,
            kalakritiCompetitionDivision.id
          ),
          inArray(kalakritiCompetitionEntry.centerId, scope.centerIds)
        )
      )
  );
  const available = and(
    isNull(kalakritiCompetition.cancelledAt),
    isNull(kalakritiCompetition.retiredAt),
    isNull(kalakritiCompetitionCategory.retiredAt),
    isNotNull(kalakritiCompetitionSession.id),
    isNull(kalakritiCompetitionSession.cancelledAt),
    isNull(kalakritiVenue.retiredAt)
  );
  return or(available, historicallyEntered) ?? sql`false`;
}

export async function getKalakritiCompetitionStatusesForAccess(
  access: KalakritiEditionAccess,
  now = Date.now(),
  database: StatusDatabase = db
) {
  if (
    !canAccessKalakritiEntries(access) ||
    (access.edition.lifecycle === "archived" && !access.isGlobalAdmin)
  ) {
    return null;
  }
  const editionId = access.edition.id;
  const guardianCenterIds =
    access.membership?.kind === "guardian"
      ? await database
          .select({ centerId: kalakritiGuardianCenter.centerId })
          .from(kalakritiGuardianCenter)
          .where(
            and(
              eq(kalakritiGuardianCenter.editionId, editionId),
              eq(kalakritiGuardianCenter.membershipId, access.membership.id)
            )
          )
          .then((rows) => rows.map(({ centerId }) => centerId))
      : [];
  const scopes = resolveKalakritiRegistrationScopes(access, guardianCenterIds);
  if (scopes.length === 0) return [];

  const hasAttendance = exists(
    database
      .select({ id: kalakritiOperation.id })
      .from(kalakritiOperation)
      .innerJoin(
        kalakritiEntryMember,
        and(
          eq(kalakritiEntryMember.editionId, kalakritiOperation.editionId),
          eq(kalakritiEntryMember.studentId, kalakritiOperation.studentId),
          eq(kalakritiEntryMember.divisionId, kalakritiCompetitionDivision.id)
        )
      )
      .where(
        and(
          eq(kalakritiOperation.editionId, editionId),
          eq(kalakritiOperation.type, "competition_attendance"),
          isNull(kalakritiOperation.supersededByOperationId),
          eq(
            kalakritiOperation.competitionSessionId,
            kalakritiCompetitionSession.id
          )
        )
      )
  );
  const hasPublishedWinner = exists(
    database
      .select({ id: kalakritiResult.id })
      .from(kalakritiResult)
      .where(
        and(
          eq(kalakritiResult.editionId, editionId),
          eq(kalakritiResult.divisionId, kalakritiCompetitionDivision.id),
          eq(kalakritiResult.status, "published"),
          isNotNull(kalakritiResult.winnerEntryId)
        )
      )
  );
  const rows = await database
    .select({
      divisionId: kalakritiCompetitionDivision.id,
      competitionCancelled: isNotNull(kalakritiCompetition.cancelledAt),
      sessionCancelled: isNotNull(kalakritiCompetitionSession.cancelledAt),
      competitionRetired: isNotNull(kalakritiCompetition.retiredAt),
      categoryRetired: isNotNull(kalakritiCompetitionCategory.retiredAt),
      venueRetired: isNotNull(kalakritiVenue.retiredAt),
      endAt: kalakritiCompetitionSession.endAt,
      hasAttendance,
      hasPublishedWinner,
    })
    .from(kalakritiCompetitionDivision)
    .innerJoin(
      kalakritiCompetition,
      and(
        eq(
          kalakritiCompetition.editionId,
          kalakritiCompetitionDivision.editionId
        ),
        eq(kalakritiCompetition.id, kalakritiCompetitionDivision.competitionId)
      )
    )
    .innerJoin(
      kalakritiCompetitionCategory,
      and(
        eq(kalakritiCompetitionCategory.editionId, editionId),
        eq(
          kalakritiCompetitionCategory.id,
          kalakritiCompetition.competitionCategoryId
        )
      )
    )
    .leftJoin(
      kalakritiCompetitionSession,
      and(
        eq(kalakritiCompetitionSession.editionId, editionId),
        eq(
          kalakritiCompetitionSession.divisionId,
          kalakritiCompetitionDivision.id
        )
      )
    )
    .leftJoin(
      kalakritiVenue,
      and(
        eq(kalakritiVenue.editionId, editionId),
        eq(kalakritiVenue.id, kalakritiCompetitionSession.venueId)
      )
    )
    .where(
      and(
        eq(kalakritiCompetitionDivision.editionId, editionId),
        or(...scopes.map((scope) => divisionScope(scope, editionId, database)))
      )
    );
  return rows.map((row) => ({
    divisionId: row.divisionId,
    status: deriveCompetitionStatus(
      {
        cancelled:
          Boolean(row.competitionCancelled) || Boolean(row.sessionCancelled),
        retired:
          Boolean(row.competitionRetired) ||
          Boolean(row.categoryRetired) ||
          Boolean(row.venueRetired),
        endAt: row.endAt?.getTime() ?? null,
        hasAttendance: Boolean(row.hasAttendance),
        hasPublishedWinner: Boolean(row.hasPublishedWinner),
      },
      now
    ),
  }));
}
