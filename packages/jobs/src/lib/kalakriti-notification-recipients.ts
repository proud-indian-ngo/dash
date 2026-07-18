import { db } from "@pi-dash/db";
import {
  kalakritiAssignment,
  kalakritiCompetition,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiGuardianCenter,
} from "@pi-dash/db/schema/kalakriti";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";

export interface KalakritiNotificationEdition {
  id: string;
  lifecycle:
    | "archived"
    | "draft"
    | "live"
    | "registration_locked"
    | "registration_open";
  name: string;
  plannedRegistrationCloseAt: Date;
  year: number;
}

export async function getKalakritiNotificationEdition(
  editionId: string
): Promise<KalakritiNotificationEdition | null> {
  const [edition] = await db
    .select({
      id: kalakritiEdition.id,
      lifecycle: kalakritiEdition.lifecycle,
      name: kalakritiEdition.name,
      plannedRegistrationCloseAt: kalakritiEdition.plannedRegistrationCloseAt,
      year: kalakritiEdition.year,
    })
    .from(kalakritiEdition)
    .where(eq(kalakritiEdition.id, editionId))
    .limit(1);
  return edition ?? null;
}

export async function resolveKalakritiGuardianRecipients(
  editionId: string
): Promise<string[]> {
  const rows = await db
    .select({ userId: kalakritiEditionMembership.userId })
    .from(kalakritiEditionMembership)
    .where(
      and(
        eq(kalakritiEditionMembership.editionId, editionId),
        eq(kalakritiEditionMembership.kind, "guardian"),
        eq(kalakritiEditionMembership.state, "active"),
        isNotNull(kalakritiEditionMembership.userId)
      )
    );
  return rows.flatMap(({ userId }) => (userId ? [userId] : []));
}

export async function resolveKalakritiScheduleRecipients({
  centerIds,
  competitionIds,
  editionId,
}: {
  centerIds: string[];
  competitionIds: string[];
  editionId: string;
}): Promise<string[]> {
  const recipientIds = new Set<string>();
  const competitionCategoryIds =
    competitionIds.length > 0
      ? [
          ...new Set(
            (
              await db
                .select({
                  competitionCategoryId:
                    kalakritiCompetition.competitionCategoryId,
                })
                .from(kalakritiCompetition)
                .where(
                  and(
                    eq(kalakritiCompetition.editionId, editionId),
                    inArray(kalakritiCompetition.id, competitionIds)
                  )
                )
            ).map(({ competitionCategoryId }) => competitionCategoryId)
          ),
        ]
      : [];

  if (centerIds.length > 0) {
    const guardianRows = await db
      .select({ userId: kalakritiEditionMembership.userId })
      .from(kalakritiGuardianCenter)
      .innerJoin(
        kalakritiEditionMembership,
        and(
          eq(
            kalakritiEditionMembership.id,
            kalakritiGuardianCenter.membershipId
          ),
          eq(
            kalakritiEditionMembership.editionId,
            kalakritiGuardianCenter.editionId
          )
        )
      )
      .where(
        and(
          eq(kalakritiGuardianCenter.editionId, editionId),
          inArray(kalakritiGuardianCenter.centerId, centerIds),
          eq(kalakritiEditionMembership.kind, "guardian"),
          eq(kalakritiEditionMembership.state, "active"),
          isNotNull(kalakritiEditionMembership.userId)
        )
      );
    for (const { userId } of guardianRows) {
      if (userId) {
        recipientIds.add(userId);
      }
    }
  }

  const centerAssignmentScope =
    centerIds.length > 0
      ? and(
          inArray(kalakritiAssignment.centerId, centerIds),
          inArray(kalakritiAssignment.responsibility, [
            "liaison",
            "transport_coordinator",
          ])
        )
      : undefined;
  const competitionAssignmentScope =
    competitionIds.length > 0
      ? and(
          inArray(kalakritiAssignment.competitionId, competitionIds),
          inArray(kalakritiAssignment.responsibility, [
            "competition_coordinator",
            "competition_volunteer",
          ])
        )
      : undefined;
  const categoryAssignmentScope =
    competitionCategoryIds.length > 0
      ? and(
          inArray(
            kalakritiAssignment.competitionCategoryId,
            competitionCategoryIds
          ),
          eq(kalakritiAssignment.responsibility, "competition_category_lead")
        )
      : undefined;
  const overallEventsLeadScope =
    competitionIds.length > 0
      ? eq(kalakritiAssignment.responsibility, "overall_events_lead")
      : undefined;
  const assignmentScope = or(
    centerAssignmentScope,
    overallEventsLeadScope,
    categoryAssignmentScope,
    competitionAssignmentScope
  );

  if (assignmentScope) {
    const assignmentRows = await db
      .select({ userId: kalakritiEditionMembership.userId })
      .from(kalakritiAssignment)
      .innerJoin(
        kalakritiEditionMembership,
        and(
          eq(kalakritiEditionMembership.id, kalakritiAssignment.membershipId),
          eq(
            kalakritiEditionMembership.editionId,
            kalakritiAssignment.editionId
          )
        )
      )
      .where(
        and(
          eq(kalakritiAssignment.editionId, editionId),
          eq(kalakritiEditionMembership.kind, "volunteer"),
          eq(kalakritiEditionMembership.state, "active"),
          isNotNull(kalakritiEditionMembership.userId),
          assignmentScope
        )
      );
    for (const { userId } of assignmentRows) {
      if (userId) {
        recipientIds.add(userId);
      }
    }
  }

  return [...recipientIds].sort();
}

export async function getKalakritiCompetitionNames(
  editionId: string,
  competitionIds: string[]
): Promise<string[]> {
  if (competitionIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ name: kalakritiCompetition.name })
    .from(kalakritiCompetition)
    .where(
      and(
        eq(kalakritiCompetition.editionId, editionId),
        inArray(kalakritiCompetition.id, competitionIds)
      )
    );
  return rows.map(({ name }) => name).sort((a, b) => a.localeCompare(b));
}
