import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import {
  kalakritiAssignment,
  kalakritiCenter,
  kalakritiCompetition,
  kalakritiCompetitionDivision,
  kalakritiCompetitionEntry,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiGuardianCenter,
} from "@pi-dash/db/schema/kalakriti";
import { and, eq } from "drizzle-orm";
import { entryMatchesKalakritiRegistrationScopes } from "@/lib/kalakriti-registration-scope-policy";
import { PrivateMediaAccessError } from "@/lib/private-media-access";
import { resolveKalakritiRegistrationScope } from "@/lib/server/kalakriti-registration-scope";

interface SessionUser {
  id: string;
  role?: null | string;
}

export interface KalakritiEntryMusicRecord {
  centerId: string;
  competitionCategoryId: string;
  competitionId: string;
  editionYear: number;
  filename: string;
  key: string;
}

export async function authorizeKalakritiEntryMusicUpload({
  centerId,
  divisionId,
  editionId,
  user,
}: {
  centerId: string;
  divisionId: string;
  editionId: string;
  user: SessionUser;
}): Promise<void> {
  const role = user.role ?? "unoriented_volunteer";
  const permissions = await resolvePermissions(role);
  if (
    !(
      permissions.includes("kalakriti.admin") ||
      permissions.includes("kalakriti.view")
    )
  ) {
    throw new PrivateMediaAccessError(403, "Forbidden");
  }

  const [edition, center, division] = await Promise.all([
    db.query.kalakritiEdition.findFirst({
      columns: { id: true, lifecycle: true },
      where: eq(kalakritiEdition.id, editionId),
    }),
    db.query.kalakritiCenter.findFirst({
      columns: {
        competitionEntryRegistrationEnabled: true,
        editionId: true,
        retiredAt: true,
      },
      where: eq(kalakritiCenter.id, centerId),
    }),
    db.query.kalakritiCompetitionDivision.findFirst({
      columns: { competitionId: true, editionId: true },
      where: eq(kalakritiCompetitionDivision.id, divisionId),
    }),
  ]);
  if (!(edition && center && division)) {
    throw new PrivateMediaAccessError(404, "Not found");
  }
  if (center.editionId !== edition.id || division.editionId !== edition.id) {
    throw new PrivateMediaAccessError(404, "Not found");
  }
  if (edition.lifecycle !== "registration_open") {
    throw new PrivateMediaAccessError(403, "Forbidden");
  }
  if (
    center.retiredAt !== null ||
    !center.competitionEntryRegistrationEnabled
  ) {
    throw new PrivateMediaAccessError(403, "Forbidden");
  }

  const competition = await db.query.kalakritiCompetition.findFirst({
    columns: { musicUploadEnabled: true },
    where: eq(kalakritiCompetition.id, division.competitionId),
  });
  if (!competition?.musicUploadEnabled) {
    throw new PrivateMediaAccessError(403, "Forbidden");
  }
  if (permissions.includes("kalakriti.admin")) {
    return;
  }

  const membership = await db.query.kalakritiEditionMembership.findFirst({
    columns: { id: true, kind: true },
    where: and(
      eq(kalakritiEditionMembership.editionId, edition.id),
      eq(kalakritiEditionMembership.userId, user.id),
      eq(kalakritiEditionMembership.state, "active")
    ),
  });
  if (!membership) {
    throw new PrivateMediaAccessError(403, "Forbidden");
  }
  const editionAdmin = await db.query.kalakritiAssignment.findFirst({
    columns: { id: true },
    where: and(
      eq(kalakritiAssignment.membershipId, membership.id),
      eq(kalakritiAssignment.responsibility, "edition_admin")
    ),
  });
  if (editionAdmin) {
    return;
  }
  const scopedAccess =
    membership.kind === "guardian"
      ? await db.query.kalakritiGuardianCenter.findFirst({
          columns: { id: true },
          where: and(
            eq(kalakritiGuardianCenter.membershipId, membership.id),
            eq(kalakritiGuardianCenter.centerId, centerId)
          ),
        })
      : await db.query.kalakritiAssignment.findFirst({
          columns: { id: true },
          where: and(
            eq(kalakritiAssignment.membershipId, membership.id),
            eq(kalakritiAssignment.responsibility, "liaison"),
            eq(kalakritiAssignment.centerId, centerId)
          ),
        });
  if (!scopedAccess) {
    throw new PrivateMediaAccessError(403, "Forbidden");
  }
}

export async function loadKalakritiEntryMusicRecord(
  entryId: string
): Promise<KalakritiEntryMusicRecord | null> {
  const entry = await db.query.kalakritiCompetitionEntry.findFirst({
    columns: {
      centerId: true,
      divisionId: true,
      editionId: true,
      musicFileName: true,
      musicObjectKey: true,
    },
    where: eq(kalakritiCompetitionEntry.id, entryId),
  });
  if (!(entry?.musicObjectKey && entry.musicFileName)) {
    return null;
  }
  const [edition, division] = await Promise.all([
    db.query.kalakritiEdition.findFirst({
      columns: { year: true },
      where: eq(kalakritiEdition.id, entry.editionId),
    }),
    db.query.kalakritiCompetitionDivision.findFirst({
      columns: { competitionId: true },
      where: eq(kalakritiCompetitionDivision.id, entry.divisionId),
    }),
  ]);
  if (!(edition && division)) {
    return null;
  }
  const competition = await db.query.kalakritiCompetition.findFirst({
    columns: { competitionCategoryId: true },
    where: eq(kalakritiCompetition.id, division.competitionId),
  });
  if (!competition) {
    return null;
  }
  return {
    centerId: entry.centerId,
    competitionCategoryId: competition.competitionCategoryId,
    competitionId: division.competitionId,
    editionYear: edition.year,
    filename: entry.musicFileName,
    key: entry.musicObjectKey,
  };
}

export async function canReadKalakritiEntryMusic(
  sessionUser: SessionUser,
  record: KalakritiEntryMusicRecord
): Promise<boolean> {
  const resolved = await resolveKalakritiRegistrationScope({
    sessionUser,
    year: record.editionYear,
  });
  if (!resolved || resolved.scopes.length === 0) {
    return false;
  }
  return entryMatchesKalakritiRegistrationScopes(resolved.scopes, record);
}
