import { db } from "@pi-dash/db";
import {
  kalakritiAgeCategory,
  kalakritiCenter,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionEntry,
  kalakritiCompetitionSession,
  kalakritiEntryMember,
  kalakritiStudent,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import { and, asc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type {
  KalakritiRegistrationExportData,
  KalakritiRegistrationExportEntryRow,
} from "@/lib/kalakriti-registration-export";
import type { KalakritiRegistrationScope } from "@/lib/kalakriti-registration-scope-policy";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function buildKalakritiRegistrationExportScopeCondition(
  scopes: readonly KalakritiRegistrationScope[]
): SQL {
  const conditions = scopes.map((scope): SQL => {
    if (scope.kind === "edition") {
      return sql`true`;
    }
    if (scope.kind === "center") {
      return inArray(kalakritiCompetitionEntry.centerId, scope.centerIds);
    }
    if (scope.kind === "competition_category") {
      return scope.competitionCategoryIds === null
        ? sql`true`
        : inArray(
            kalakritiCompetition.competitionCategoryId,
            scope.competitionCategoryIds
          );
    }
    return inArray(kalakritiCompetition.id, scope.competitionIds);
  });
  return or(...conditions) ?? sql`false`;
}

export function buildKalakritiRegistrationExportEntryCondition(
  editionId: string,
  scopes: readonly KalakritiRegistrationScope[]
) {
  return and(
    eq(kalakritiCompetitionEntry.editionId, editionId),
    buildKalakritiRegistrationExportScopeCondition(scopes)
  ) as SQL;
}

export function buildKalakritiRegistrationExportStudentCondition({
  editionId,
  participantStudentIds,
  scopes,
}: {
  editionId: string;
  participantStudentIds: readonly string[];
  scopes: readonly KalakritiRegistrationScope[];
}) {
  const conditions: SQL[] = [];
  for (const scope of scopes) {
    if (scope.kind === "edition") {
      conditions.push(sql`true`);
    } else if (scope.kind === "center") {
      conditions.push(inArray(kalakritiStudent.centerId, scope.centerIds));
    }
  }
  if (participantStudentIds.length > 0) {
    conditions.push(inArray(kalakritiStudent.id, participantStudentIds));
  }
  return and(
    eq(kalakritiStudent.editionId, editionId),
    or(...conditions) ?? sql`false`
  ) as SQL;
}

interface EntryQueryRow {
  ageCategory: string;
  center: string;
  competition: string;
  competitionCategory: string;
  endAt: Date;
  entryId: string;
  participantId: string | null;
  participantName: string | null;
  participationMode: string;
  startAt: Date;
  studentId: string | null;
  venue: string;
}

export function assembleKalakritiRegistrationExportEntries(
  rows: readonly EntryQueryRow[]
): KalakritiRegistrationExportEntryRow[] {
  const entries = new Map<string, KalakritiRegistrationExportEntryRow>();
  for (const row of rows) {
    let entry = entries.get(row.entryId);
    if (!entry) {
      entry = {
        ageCategory: row.ageCategory,
        center: row.center,
        competition: row.competition,
        competitionCategory: row.competitionCategory,
        endAt: row.endAt.toISOString(),
        entryId: row.entryId,
        participantIds: [],
        participantNames: [],
        participationMode: row.participationMode,
        startAt: row.startAt.toISOString(),
        venue: row.venue,
      };
      entries.set(row.entryId, entry);
    }
    if (row.studentId && row.participantId && row.participantName) {
      entry.participantIds.push(row.participantId);
      entry.participantNames.push(row.participantName);
    }
  }
  return [...entries.values()];
}

function loadScopedEntryRows({
  editionId,
  scopes,
  tx,
}: {
  editionId: string;
  scopes: readonly KalakritiRegistrationScope[];
  tx: DbTransaction;
}) {
  return tx
    .select({
      ageCategory: kalakritiAgeCategory.name,
      center: kalakritiCenter.name,
      competition: kalakritiCompetition.name,
      competitionCategory: kalakritiCompetitionCategory.name,
      endAt: kalakritiCompetitionSession.endAt,
      entryId: kalakritiCompetitionEntry.id,
      participantId: kalakritiStudent.humanId,
      participantName: kalakritiStudent.name,
      participationMode: kalakritiCompetitionEntry.participationMode,
      startAt: kalakritiCompetitionSession.startAt,
      studentId: kalakritiStudent.id,
      venue: kalakritiVenue.name,
    })
    .from(kalakritiCompetitionEntry)
    .innerJoin(
      kalakritiCompetitionSession,
      and(
        eq(
          kalakritiCompetitionSession.editionId,
          kalakritiCompetitionEntry.editionId
        ),
        eq(kalakritiCompetitionSession.id, kalakritiCompetitionEntry.sessionId)
      )
    )
    .innerJoin(
      kalakritiCompetition,
      and(
        eq(
          kalakritiCompetition.editionId,
          kalakritiCompetitionSession.editionId
        ),
        eq(kalakritiCompetition.id, kalakritiCompetitionSession.competitionId)
      )
    )
    .innerJoin(
      kalakritiCompetitionCategory,
      and(
        eq(
          kalakritiCompetitionCategory.editionId,
          kalakritiCompetition.editionId
        ),
        eq(
          kalakritiCompetitionCategory.id,
          kalakritiCompetition.competitionCategoryId
        )
      )
    )
    .innerJoin(
      kalakritiCenter,
      and(
        eq(kalakritiCenter.editionId, kalakritiCompetitionEntry.editionId),
        eq(kalakritiCenter.id, kalakritiCompetitionEntry.centerId)
      )
    )
    .innerJoin(
      kalakritiAgeCategory,
      and(
        eq(
          kalakritiAgeCategory.editionId,
          kalakritiCompetitionSession.editionId
        ),
        eq(kalakritiAgeCategory.id, kalakritiCompetitionSession.ageCategoryId)
      )
    )
    .innerJoin(
      kalakritiVenue,
      and(
        eq(kalakritiVenue.editionId, kalakritiCompetitionSession.editionId),
        eq(kalakritiVenue.id, kalakritiCompetitionSession.venueId)
      )
    )
    .leftJoin(
      kalakritiEntryMember,
      and(
        eq(kalakritiEntryMember.editionId, kalakritiCompetitionEntry.editionId),
        eq(kalakritiEntryMember.entryId, kalakritiCompetitionEntry.id)
      )
    )
    .leftJoin(
      kalakritiStudent,
      and(
        eq(kalakritiStudent.editionId, kalakritiEntryMember.editionId),
        eq(kalakritiStudent.id, kalakritiEntryMember.studentId)
      )
    )
    .where(buildKalakritiRegistrationExportEntryCondition(editionId, scopes))
    .orderBy(
      asc(kalakritiCompetitionCategory.name),
      asc(kalakritiCompetition.name),
      asc(kalakritiAgeCategory.sortOrder),
      asc(kalakritiCenter.name),
      asc(kalakritiCompetitionEntry.id),
      asc(kalakritiStudent.name)
    );
}

function loadScopedStudents({
  editionId,
  entryRows,
  scopes,
  tx,
}: {
  editionId: string;
  entryRows: readonly EntryQueryRow[];
  scopes: readonly KalakritiRegistrationScope[];
  tx: DbTransaction;
}) {
  const participantStudentIds = [
    ...new Set(
      entryRows.flatMap((row) => (row.studentId ? [row.studentId] : []))
    ),
  ];
  return tx
    .select({
      ageCategory: kalakritiAgeCategory.name,
      center: kalakritiCenter.name,
      dateOfBirth: kalakritiStudent.dateOfBirth,
      gender: kalakritiStudent.gender,
      name: kalakritiStudent.name,
      studentId: kalakritiStudent.humanId,
    })
    .from(kalakritiStudent)
    .innerJoin(
      kalakritiCenter,
      and(
        eq(kalakritiCenter.editionId, kalakritiStudent.editionId),
        eq(kalakritiCenter.id, kalakritiStudent.centerId)
      )
    )
    .innerJoin(
      kalakritiAgeCategory,
      and(
        eq(kalakritiAgeCategory.editionId, kalakritiStudent.editionId),
        eq(kalakritiAgeCategory.id, kalakritiStudent.ageCategoryId)
      )
    )
    .where(
      buildKalakritiRegistrationExportStudentCondition({
        editionId,
        participantStudentIds,
        scopes,
      })
    )
    .orderBy(
      asc(kalakritiCenter.name),
      asc(kalakritiStudent.name),
      asc(kalakritiStudent.humanId)
    );
}

export function getKalakritiRegistrationExport({
  editionId,
  scopes,
}: {
  editionId: string;
  scopes: readonly KalakritiRegistrationScope[];
}): Promise<KalakritiRegistrationExportData> {
  if (scopes.length === 0) {
    return Promise.resolve({ entries: [], students: [] });
  }
  return db.transaction(
    async (tx) => {
      const entryRows = await loadScopedEntryRows({ editionId, scopes, tx });
      const students = await loadScopedStudents({
        editionId,
        entryRows,
        scopes,
        tx,
      });
      return {
        entries: assembleKalakritiRegistrationExportEntries(entryRows),
        students,
      };
    },
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );
}
