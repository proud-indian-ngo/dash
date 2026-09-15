import { db } from "@pi-dash/db";
import {
  kalakritiAssignment,
  kalakritiAttendee,
  kalakritiCenter,
  kalakritiCompetition,
  kalakritiCompetitionDivision,
  kalakritiCompetitionSession,
  kalakritiEditionMembership,
  kalakritiEntryMember,
  kalakritiGuardianCenter,
  kalakritiStudent,
} from "@pi-dash/db/schema/kalakriti";
import type { KalakritiIdCardData } from "@pi-dash/pdf/kalakriti-id-cards.tsx";
import { KALAKRITI_RESPONSIBILITY_LABELS } from "@pi-dash/shared/kalakriti";
import { and, asc, eq, isNull } from "drizzle-orm";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const TYPE_ORDER = {
  student: 0,
  volunteer: 1,
  guardian: 2,
  judge: 3,
  guest: 4,
} satisfies Record<KalakritiIdCardData["type"], number>;

function loadStudentRows(editionId: string, tx: DbTransaction) {
  return tx
    .select({
      centerName: kalakritiCenter.name,
      competitionId: kalakritiCompetition.id,
      competitionName: kalakritiCompetition.name,
      id: kalakritiStudent.id,
      name: kalakritiStudent.name,
      startsAt: kalakritiCompetitionSession.startAt,
    })
    .from(kalakritiStudent)
    .innerJoin(
      kalakritiCenter,
      and(
        eq(kalakritiCenter.editionId, kalakritiStudent.editionId),
        eq(kalakritiCenter.id, kalakritiStudent.centerId),
        isNull(kalakritiCenter.retiredAt)
      )
    )
    .leftJoin(
      kalakritiEntryMember,
      and(
        eq(kalakritiEntryMember.editionId, kalakritiStudent.editionId),
        eq(kalakritiEntryMember.studentId, kalakritiStudent.id)
      )
    )
    .leftJoin(
      kalakritiCompetitionDivision,
      and(
        eq(
          kalakritiCompetitionDivision.editionId,
          kalakritiEntryMember.editionId
        ),
        eq(kalakritiCompetitionDivision.id, kalakritiEntryMember.divisionId)
      )
    )
    .leftJoin(
      kalakritiCompetition,
      and(
        eq(
          kalakritiCompetition.editionId,
          kalakritiCompetitionDivision.editionId
        ),
        eq(kalakritiCompetition.id, kalakritiCompetitionDivision.competitionId),
        isNull(kalakritiCompetition.cancelledAt),
        isNull(kalakritiCompetition.retiredAt)
      )
    )
    .leftJoin(
      kalakritiCompetitionSession,
      and(
        eq(
          kalakritiCompetitionSession.editionId,
          kalakritiCompetitionDivision.editionId
        ),
        eq(
          kalakritiCompetitionSession.divisionId,
          kalakritiCompetitionDivision.id
        ),
        isNull(kalakritiCompetitionSession.cancelledAt)
      )
    )
    .where(eq(kalakritiStudent.editionId, editionId))
    .orderBy(
      asc(kalakritiStudent.name),
      asc(kalakritiStudent.id),
      asc(kalakritiCompetitionSession.startAt),
      asc(kalakritiCompetition.name),
      asc(kalakritiCompetition.id)
    );
}

function loadMembershipRows(editionId: string, tx: DbTransaction) {
  return tx
    .select({
      centerName: kalakritiCenter.name,
      id: kalakritiEditionMembership.id,
      kind: kalakritiEditionMembership.kind,
      name: kalakritiEditionMembership.snapshotName,
      responsibility: kalakritiAssignment.responsibility,
    })
    .from(kalakritiEditionMembership)
    .leftJoin(
      kalakritiAssignment,
      and(
        eq(kalakritiAssignment.editionId, kalakritiEditionMembership.editionId),
        eq(kalakritiAssignment.membershipId, kalakritiEditionMembership.id)
      )
    )
    .leftJoin(
      kalakritiGuardianCenter,
      and(
        eq(
          kalakritiGuardianCenter.editionId,
          kalakritiEditionMembership.editionId
        ),
        eq(kalakritiGuardianCenter.membershipId, kalakritiEditionMembership.id)
      )
    )
    .leftJoin(
      kalakritiCenter,
      and(
        eq(kalakritiCenter.editionId, kalakritiGuardianCenter.editionId),
        eq(kalakritiCenter.id, kalakritiGuardianCenter.centerId),
        isNull(kalakritiCenter.retiredAt)
      )
    )
    .where(
      and(
        eq(kalakritiEditionMembership.editionId, editionId),
        eq(kalakritiEditionMembership.state, "active")
      )
    )
    .orderBy(
      asc(kalakritiEditionMembership.snapshotName),
      asc(kalakritiEditionMembership.id),
      asc(kalakritiAssignment.responsibility),
      asc(kalakritiCenter.name)
    );
}

function loadAttendeeRows(editionId: string, tx: DbTransaction) {
  return tx
    .select({
      id: kalakritiAttendee.id,
      name: kalakritiAttendee.name,
      type: kalakritiAttendee.kind,
    })
    .from(kalakritiAttendee)
    .where(
      and(
        eq(kalakritiAttendee.editionId, editionId),
        isNull(kalakritiAttendee.archivedAt)
      )
    )
    .orderBy(
      asc(kalakritiAttendee.kind),
      asc(kalakritiAttendee.name),
      asc(kalakritiAttendee.id)
    );
}

function compareCards(left: KalakritiIdCardData, right: KalakritiIdCardData) {
  return (
    TYPE_ORDER[left.type] - TYPE_ORDER[right.type] ||
    left.name.localeCompare(right.name, "en", { sensitivity: "base" }) ||
    left.id.localeCompare(right.id)
  );
}

export async function getKalakritiIdCardData(
  editionId: string
): Promise<KalakritiIdCardData[]> {
  return db.transaction(
    async (tx) => {
      const studentRows = await loadStudentRows(editionId, tx);
      const membershipRows = await loadMembershipRows(editionId, tx);
      const attendeeRows = await loadAttendeeRows(editionId, tx);

      const students = new Map<
        string,
        Extract<KalakritiIdCardData, { type: "student" }> & {
          competitionIds: Set<string>;
        }
      >();
      for (const row of studentRows) {
        let student = students.get(row.id);
        if (!student) {
          student = {
            centerName: row.centerName,
            competitionIds: new Set(),
            competitions: [],
            id: row.id,
            name: row.name,
            type: "student",
          };
          students.set(row.id, student);
        }
        if (
          row.competitionId &&
          row.competitionName &&
          !student.competitionIds.has(row.competitionId)
        ) {
          student.competitionIds.add(row.competitionId);
          student.competitions.push({
            name: row.competitionName,
            startsAt: row.startsAt?.getTime() ?? null,
          });
        }
      }

      const memberships = new Map<
        string,
        {
          centers: Set<string>;
          id: string;
          kind: "guardian" | "volunteer";
          name: string;
          roles: Set<string>;
        }
      >();
      for (const row of membershipRows) {
        let membership = memberships.get(row.id);
        if (!membership) {
          membership = {
            centers: new Set(),
            id: row.id,
            kind: row.kind,
            name: row.name,
            roles: new Set(),
          };
          memberships.set(row.id, membership);
        }
        if (row.centerName) {
          membership.centers.add(row.centerName);
        }
        if (row.responsibility) {
          membership.roles.add(
            KALAKRITI_RESPONSIBILITY_LABELS[row.responsibility]
          );
        }
      }

      const cards: KalakritiIdCardData[] = [
        ...[...students.values()].map(
          ({ competitionIds: _competitionIds, ...student }) => student
        ),
        ...[...memberships.values()].map((membership) =>
          membership.kind === "guardian"
            ? {
                centerName: [...membership.centers].sort().join(", "),
                id: membership.id,
                name: membership.name,
                type: "guardian" as const,
              }
            : {
                id: membership.id,
                name: membership.name,
                role: [...membership.roles].sort().join(", "),
                type: "volunteer" as const,
              }
        ),
        ...attendeeRows,
      ];

      return cards.sort(compareCards);
    },
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );
}
