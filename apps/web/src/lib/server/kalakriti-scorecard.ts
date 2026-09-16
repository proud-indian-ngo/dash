import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import {
  kalakritiAssignment,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionDivision,
  kalakritiEdition,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import {
  kalakritiResultScorecard,
  kalakritiResultsState,
} from "@pi-dash/db/schema/kalakriti-results";
import { canManageKalakritiResults } from "@pi-dash/shared/kalakriti-results";
import { and, eq } from "drizzle-orm";

import { PrivateMediaAccessError } from "@/lib/private-media-access";

interface SessionUser {
  id: string;
  role?: null | string;
}

export interface KalakritiScorecardRecord {
  competitionCategoryId: string;
  competitionId: string;
  divisionId: string;
  editionId: string;
  filename: string;
  key: string;
}

async function canManageDivision(
  user: SessionUser,
  editionId: string,
  competitionCategoryId: string,
  competitionId: string
): Promise<boolean> {
  const permissions = await resolvePermissions(
    user.role ?? "unoriented_volunteer"
  );
  if (permissions.includes("kalakriti.admin")) return true;

  const membership = await db.query.kalakritiEditionMembership.findFirst({
    columns: { id: true, kind: true },
    where: and(
      eq(kalakritiEditionMembership.editionId, editionId),
      eq(kalakritiEditionMembership.userId, user.id),
      eq(kalakritiEditionMembership.state, "active")
    ),
  });
  if (membership?.kind !== "volunteer") return false;

  const assignments = await db.query.kalakritiAssignment.findMany({
    columns: {
      competitionCategoryId: true,
      competitionId: true,
      responsibility: true,
    },
    where: and(
      eq(kalakritiAssignment.editionId, editionId),
      eq(kalakritiAssignment.membershipId, membership.id)
    ),
  });
  return canManageKalakritiResults(
    {
      isGlobalAdmin: false,
      membership: { kind: membership.kind, assignments },
    },
    { id: competitionId, competitionCategoryId }
  );
}

export async function authorizeKalakritiScorecardUpload({
  editionId,
  divisionId,
  user,
}: {
  divisionId: string;
  editionId: string;
  user: SessionUser;
}): Promise<void> {
  const [edition, division, resultsState] = await Promise.all([
    db.query.kalakritiEdition.findFirst({
      columns: { lifecycle: true },
      where: eq(kalakritiEdition.id, editionId),
    }),
    db.query.kalakritiCompetitionDivision.findFirst({
      columns: { competitionId: true, editionId: true },
      where: eq(kalakritiCompetitionDivision.id, divisionId),
    }),
    db.query.kalakritiResultsState.findFirst({
      columns: { finalizedAt: true },
      where: eq(kalakritiResultsState.editionId, editionId),
    }),
  ]);
  if (!edition || !division || division.editionId !== editionId) {
    throw new PrivateMediaAccessError(404, "Not found");
  }
  if (edition.lifecycle !== "live" || resultsState?.finalizedAt) {
    throw new PrivateMediaAccessError(403, "Forbidden");
  }

  const competition = await db.query.kalakritiCompetition.findFirst({
    columns: {
      cancelledAt: true,
      competitionCategoryId: true,
      editionId: true,
      retiredAt: true,
    },
    where: eq(kalakritiCompetition.id, division.competitionId),
  });
  if (
    !competition ||
    competition.editionId !== editionId ||
    competition.cancelledAt ||
    competition.retiredAt
  ) {
    throw new PrivateMediaAccessError(403, "Forbidden");
  }
  const category = await db.query.kalakritiCompetitionCategory.findFirst({
    columns: { editionId: true, retiredAt: true },
    where: eq(
      kalakritiCompetitionCategory.id,
      competition.competitionCategoryId
    ),
  });
  if (!category || category.editionId !== editionId || category.retiredAt) {
    throw new PrivateMediaAccessError(403, "Forbidden");
  }
  if (
    !(await canManageDivision(
      user,
      editionId,
      competition.competitionCategoryId,
      division.competitionId
    ))
  ) {
    throw new PrivateMediaAccessError(403, "Forbidden");
  }
}

export async function loadKalakritiScorecardRecord(
  scorecardId: string
): Promise<KalakritiScorecardRecord | null> {
  const scorecard = await db.query.kalakritiResultScorecard.findFirst({
    where: eq(kalakritiResultScorecard.id, scorecardId),
  });
  if (!scorecard) return null;
  const division = await db.query.kalakritiCompetitionDivision.findFirst({
    columns: { competitionId: true, editionId: true },
    where: and(
      eq(kalakritiCompetitionDivision.id, scorecard.divisionId),
      eq(kalakritiCompetitionDivision.editionId, scorecard.editionId)
    ),
  });
  if (!division) return null;
  const competition = await db.query.kalakritiCompetition.findFirst({
    columns: { competitionCategoryId: true, editionId: true },
    where: eq(kalakritiCompetition.id, division.competitionId),
  });
  if (!competition || competition.editionId !== scorecard.editionId)
    return null;
  return {
    competitionCategoryId: competition.competitionCategoryId,
    competitionId: division.competitionId,
    divisionId: scorecard.divisionId,
    editionId: scorecard.editionId,
    filename: scorecard.fileName,
    key: scorecard.objectKey,
  };
}

export async function canReadKalakritiScorecard(
  user: SessionUser,
  record: KalakritiScorecardRecord
): Promise<boolean> {
  const edition = await db.query.kalakritiEdition.findFirst({
    columns: { lifecycle: true },
    where: eq(kalakritiEdition.id, record.editionId),
  });
  if (!edition) return false;
  const permissions = await resolvePermissions(
    user.role ?? "unoriented_volunteer"
  );
  if (permissions.includes("kalakriti.admin")) return true;
  if (edition.lifecycle === "archived") return false;
  return canManageDivision(
    user,
    record.editionId,
    record.competitionCategoryId,
    record.competitionId
  );
}
