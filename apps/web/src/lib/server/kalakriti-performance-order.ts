import { db } from "@pi-dash/db";
import {
  kalakritiCompetition,
  kalakritiCompetitionDivision,
  kalakritiCompetitionSession,
  kalakritiEntryMember,
  kalakritiGuardianCenter,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import {
  indexKalakritiNextSlotsByStudent,
  type KalakritiStudentNextSlot,
} from "@pi-dash/shared/kalakriti-performance-order";
import { and, eq, gte, inArray, isNull, ne, type SQL } from "drizzle-orm";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import {
  canAccessKalakritiEntries,
  canViewAllKalakritiCompetitions,
} from "@/lib/kalakriti-entry-policy";
import {
  resolveKalakritiRegistrationScopes,
  type KalakritiRegistrationScope,
} from "@/lib/kalakriti-registration-scope-policy";

type NextSlotDatabase = Pick<typeof db, "select">;

export function kalakritiDivisionReadableByScopes(
  scopes: readonly KalakritiRegistrationScope[],
  division: {
    competitionCategoryId: string;
    competitionId: string;
  }
): { centerIds: string[] | null } | null {
  let centerIds: string[] | null = null;
  let allowed = false;
  for (const scope of scopes) {
    if (scope.kind === "edition") {
      return { centerIds: null };
    }
    if (
      scope.kind === "competition_category" &&
      (scope.competitionCategoryIds === null ||
        scope.competitionCategoryIds.includes(division.competitionCategoryId))
    ) {
      return { centerIds: null };
    }
    if (
      scope.kind === "competition" &&
      scope.competitionIds.includes(division.competitionId)
    ) {
      return { centerIds: null };
    }
    if (scope.kind === "center") {
      allowed = true;
      centerIds = [...new Set([...(centerIds ?? []), ...scope.centerIds])];
    }
  }
  return allowed ? { centerIds } : null;
}

export async function getKalakritiNextSlotsForAccess(
  access: KalakritiEditionAccess,
  divisionId: string,
  database: NextSlotDatabase = db
): Promise<KalakritiStudentNextSlot[] | null> {
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
  const scopes: KalakritiRegistrationScope[] = canViewAllKalakritiCompetitions(
    access
  )
    ? [{ kind: "edition" }]
    : resolveKalakritiRegistrationScopes(access, guardianCenterIds);
  if (scopes.length === 0) return [];

  const [division] = await database
    .select({
      competitionCategoryId: kalakritiCompetition.competitionCategoryId,
      competitionId: kalakritiCompetition.id,
      endAt: kalakritiCompetitionSession.endAt,
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
    .leftJoin(
      kalakritiCompetitionSession,
      and(
        eq(kalakritiCompetitionSession.editionId, editionId),
        eq(
          kalakritiCompetitionSession.divisionId,
          kalakritiCompetitionDivision.id
        ),
        isNull(kalakritiCompetitionSession.cancelledAt)
      )
    )
    .where(
      and(
        eq(kalakritiCompetitionDivision.editionId, editionId),
        eq(kalakritiCompetitionDivision.id, divisionId)
      )
    );
  if (!division?.endAt) return [];
  const visibility = kalakritiDivisionReadableByScopes(scopes, division);
  if (!visibility) return [];

  const memberFilters: SQL[] = [
    eq(kalakritiEntryMember.editionId, editionId),
    eq(kalakritiEntryMember.divisionId, divisionId),
  ];
  if (visibility.centerIds) {
    memberFilters.push(
      inArray(kalakritiEntryMember.centerId, visibility.centerIds)
    );
  }
  const members = await database
    .select({ studentId: kalakritiEntryMember.studentId })
    .from(kalakritiEntryMember)
    .where(and(...memberFilters));
  const studentIds = [...new Set(members.map((member) => member.studentId))];
  if (studentIds.length === 0) return [];

  const otherSlots = await database
    .select({
      competitionName: kalakritiCompetition.name,
      startAt: kalakritiCompetitionSession.startAt,
      studentId: kalakritiEntryMember.studentId,
      venueName: kalakritiVenue.name,
    })
    .from(kalakritiEntryMember)
    .innerJoin(
      kalakritiCompetitionDivision,
      and(
        eq(
          kalakritiCompetitionDivision.editionId,
          kalakritiEntryMember.editionId
        ),
        eq(kalakritiCompetitionDivision.id, kalakritiEntryMember.divisionId)
      )
    )
    .innerJoin(
      kalakritiCompetition,
      and(
        eq(kalakritiCompetition.editionId, kalakritiEntryMember.editionId),
        eq(kalakritiCompetition.id, kalakritiCompetitionDivision.competitionId),
        isNull(kalakritiCompetition.cancelledAt),
        isNull(kalakritiCompetition.retiredAt)
      )
    )
    .innerJoin(
      kalakritiCompetitionSession,
      and(
        eq(
          kalakritiCompetitionSession.editionId,
          kalakritiEntryMember.editionId
        ),
        eq(
          kalakritiCompetitionSession.divisionId,
          kalakritiEntryMember.divisionId
        ),
        isNull(kalakritiCompetitionSession.cancelledAt),
        gte(kalakritiCompetitionSession.startAt, division.endAt)
      )
    )
    .innerJoin(
      kalakritiVenue,
      and(
        eq(kalakritiVenue.editionId, kalakritiEntryMember.editionId),
        eq(kalakritiVenue.id, kalakritiCompetitionSession.venueId)
      )
    )
    .where(
      and(
        eq(kalakritiEntryMember.editionId, editionId),
        ne(kalakritiEntryMember.divisionId, divisionId),
        inArray(kalakritiEntryMember.studentId, studentIds)
      )
    );

  return [
    ...indexKalakritiNextSlotsByStudent(
      otherSlots.map((slot) => ({
        competitionName: slot.competitionName,
        startAt: slot.startAt.getTime(),
        studentId: slot.studentId,
        venueName: slot.venueName,
      }))
    ).values(),
  ];
}
