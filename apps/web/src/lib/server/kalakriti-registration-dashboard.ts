import { db } from "@pi-dash/db";
import {
  kalakritiAgeCategory,
  kalakritiCenter,
  kalakritiCenterAgeQuota,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionEntry,
  kalakritiCompetitionSession,
  kalakritiEntryMember,
  kalakritiStudent,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import {
  and,
  asc,
  countDistinct,
  eq,
  inArray,
  type SQL,
  sql,
} from "drizzle-orm";
import type { KalakritiRegistrationDashboardScope } from "@/lib/kalakriti-registration-dashboard-policy";

interface CenterConfig {
  id: string;
  name: string;
}

interface AgeConfig {
  id: string;
  name: string;
  sortOrder: number;
}

interface CategoryConfig {
  id: string;
  name: string;
  sortOrder: number;
}

interface CompetitionConfig {
  cancelled: boolean;
  categoryId: string;
  categoryRetired: boolean;
  id: string;
  name: string;
  retired: boolean;
}

interface SessionAggregate {
  ageCategoryId: string;
  cancelled: boolean;
  capacity: number;
  competitionId: string;
  id: string;
  venueRetired: boolean;
}

interface EntryAggregate {
  centerId: string;
  entries: number;
  participants: number;
  sessionId: string;
}

interface StudentAggregate {
  ageCategoryId: string;
  centerId: string;
  femaleStudents: number;
  maleStudents: number;
  registeredStudents: number;
  students: number;
}

interface ParticipantAggregate {
  ageCategoryId: string;
  registeredStudents: number;
}

interface QuotaConfig {
  ageCategoryId: string;
  centerId: string;
  femaleLimit: number;
  maleLimit: number;
}

export interface KalakritiRegistrationDashboardProjection {
  ageCategories: Array<{
    capacity: number | null;
    entries: number;
    id: string;
    name: string;
    participants: number;
    registeredStudents: number;
    students: number;
  }>;
  centers: Array<{
    entries: number;
    id: string;
    name: string;
    participants: number;
    quotaLimit: number;
    registeredStudents: number;
    students: number;
  }>;
  competitionCategories: Array<{
    capacity: number | null;
    competitions: number;
    entries: number;
    id: string;
    name: string;
    participants: number;
  }>;
  competitions: Array<{
    capacity: number | null;
    cancelled: boolean;
    categoryName: string;
    entries: number;
    id: string;
    name: string;
    participants: number;
    retired: boolean;
    sessions: number;
  }>;
  quotas: Array<{
    ageCategoryName: string;
    centerName: string;
    femaleLimit: number;
    femaleUsed: number;
    maleLimit: number;
    maleUsed: number;
  }>;
  scope: KalakritiRegistrationDashboardScope;
  totals: {
    capacity: number | null;
    entries: number;
    participants: number;
    quotaLimit: number | null;
    registeredStudents: number;
    students: number;
  };
}

interface ProjectionRows {
  ages: AgeConfig[];
  categories: CategoryConfig[];
  centers: CenterConfig[];
  competitions: CompetitionConfig[];
  entries: EntryAggregate[];
  participants: ParticipantAggregate[];
  quotas: QuotaConfig[];
  sessions: SessionAggregate[];
  students: StudentAggregate[];
}

function sum<T>(rows: readonly T[], value: (row: T) => number) {
  return rows.reduce((total, row) => total + value(row), 0);
}

export function assembleKalakritiRegistrationDashboardProjection(
  scope: KalakritiRegistrationDashboardScope,
  rows: ProjectionRows
): KalakritiRegistrationDashboardProjection {
  const ageById = new Map(rows.ages.map((age) => [age.id, age]));
  const centerById = new Map(rows.centers.map((center) => [center.id, center]));
  const categoryById = new Map(
    rows.categories.map((category) => [category.id, category])
  );
  const competitionById = new Map(
    rows.competitions.map((competition) => [competition.id, competition])
  );
  const sessionById = new Map(
    rows.sessions.map((session) => [session.id, session])
  );
  const entriesFor = (predicate: (session: SessionAggregate) => boolean) =>
    rows.entries.filter((entry) => {
      const session = sessionById.get(entry.sessionId);
      return session ? predicate(session) : false;
    });
  const capacityVisible = scope.kind !== "center";
  const activeSessions = (sessions: SessionAggregate[]) =>
    sessions.filter((session) => {
      const competition = competitionById.get(session.competitionId);
      return !(
        session.cancelled ||
        session.venueRetired ||
        competition?.cancelled ||
        competition?.categoryRetired ||
        competition?.retired
      );
    });

  const competitions = rows.competitions.map((competition) => {
    const sessions = rows.sessions.filter(
      (session) => session.competitionId === competition.id
    );
    const entries = entriesFor(
      (session) => session.competitionId === competition.id
    );
    return {
      cancelled: competition.cancelled,
      capacity: capacityVisible
        ? sum(activeSessions(sessions), (session) => session.capacity)
        : null,
      categoryName:
        categoryById.get(competition.categoryId)?.name ?? "Unknown category",
      entries: sum(entries, (entry) => entry.entries),
      id: competition.id,
      name: competition.name,
      participants: sum(entries, (entry) => entry.participants),
      retired: competition.retired,
      sessions: sessions.length,
    };
  });

  const competitionCategories = rows.categories.map((category) => {
    const categoryCompetitions = rows.competitions.filter(
      (competition) => competition.categoryId === category.id
    );
    const ids = new Set(categoryCompetitions.map(({ id }) => id));
    const entries = entriesFor((session) => ids.has(session.competitionId));
    return {
      capacity: capacityVisible
        ? sum(
            competitions.filter((item) => ids.has(item.id)),
            (item) => item.capacity ?? 0
          )
        : null,
      competitions: categoryCompetitions.length,
      entries: sum(entries, (entry) => entry.entries),
      id: category.id,
      name: category.name,
      participants: sum(entries, (entry) => entry.participants),
    };
  });

  const ageCategories = rows.ages
    .filter(
      (age) =>
        scope.kind === "edition" ||
        scope.kind === "center" ||
        rows.sessions.some((session) => session.ageCategoryId === age.id)
    )
    .map((age) => {
      const sessions = rows.sessions.filter(
        (session) => session.ageCategoryId === age.id
      );
      const sessionIds = new Set(sessions.map(({ id }) => id));
      const entries = rows.entries.filter((entry) =>
        sessionIds.has(entry.sessionId)
      );
      const students = rows.students.filter(
        (student) => student.ageCategoryId === age.id
      );
      const participant = rows.participants.find(
        (item) => item.ageCategoryId === age.id
      );
      return {
        capacity: capacityVisible
          ? sum(activeSessions(sessions), (session) => session.capacity)
          : null,
        entries: sum(entries, (entry) => entry.entries),
        id: age.id,
        name: age.name,
        participants: sum(entries, (entry) => entry.participants),
        registeredStudents:
          participant?.registeredStudents ??
          sum(students, (student) => student.registeredStudents),
        students:
          participant?.registeredStudents ??
          sum(students, (student) => student.students),
      };
    });

  const quotas = rows.quotas.map((quota) => {
    const student = rows.students.find(
      (item) =>
        item.centerId === quota.centerId &&
        item.ageCategoryId === quota.ageCategoryId
    );
    return {
      ageCategoryName:
        ageById.get(quota.ageCategoryId)?.name ?? "Unknown age category",
      centerName: centerById.get(quota.centerId)?.name ?? "Unknown center",
      femaleLimit: quota.femaleLimit,
      femaleUsed: student?.femaleStudents ?? 0,
      maleLimit: quota.maleLimit,
      maleUsed: student?.maleStudents ?? 0,
    };
  });

  const centers = rows.centers.map((center) => {
    const students = rows.students.filter(
      (student) => student.centerId === center.id
    );
    const entries = rows.entries.filter(
      (entry) => entry.centerId === center.id
    );
    const centerQuotas = rows.quotas.filter(
      (quota) => quota.centerId === center.id
    );
    return {
      entries: sum(entries, (entry) => entry.entries),
      id: center.id,
      name: center.name,
      participants: sum(entries, (entry) => entry.participants),
      quotaLimit: sum(
        centerQuotas,
        (quota) => quota.femaleLimit + quota.maleLimit
      ),
      registeredStudents: sum(
        students,
        (student) => student.registeredStudents
      ),
      students: sum(students, (student) => student.students),
    };
  });

  const studentTotal = sum(ageCategories, (age) => age.students);
  const registeredStudentTotal = sum(
    ageCategories,
    (age) => age.registeredStudents
  );
  return {
    ageCategories,
    centers,
    competitionCategories,
    competitions,
    quotas,
    scope,
    totals: {
      capacity: capacityVisible
        ? sum(competitions, (competition) => competition.capacity ?? 0)
        : null,
      entries: sum(competitions, (competition) => competition.entries),
      participants: sum(
        competitions,
        (competition) => competition.participants
      ),
      quotaLimit:
        scope.kind === "edition" || scope.kind === "center"
          ? sum(quotas, (quota) => quota.femaleLimit + quota.maleLimit)
          : null,
      registeredStudents: registeredStudentTotal,
      students: studentTotal,
    },
  };
}

export function buildKalakritiRegistrationDashboardCompetitionCondition(
  scope: KalakritiRegistrationDashboardScope
) {
  if (scope.kind === "competition_category" && scope.competitionCategoryIds) {
    return inArray(
      kalakritiCompetition.competitionCategoryId,
      scope.competitionCategoryIds
    );
  }
  if (scope.kind === "competition") {
    return inArray(kalakritiCompetition.id, scope.competitionIds);
  }
  return sql`true`;
}

export function buildKalakritiRegistrationDashboardCenterCondition(
  scope: KalakritiRegistrationDashboardScope,
  column:
    | typeof kalakritiCenter.id
    | typeof kalakritiStudent.centerId
    | typeof kalakritiCompetitionEntry.centerId
): SQL {
  return scope.kind === "center" ? inArray(column, scope.centerIds) : sql`true`;
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function buildKalakritiRegistrationDashboardCategoryCondition(
  tx: DbTransaction,
  editionId: string,
  scope: KalakritiRegistrationDashboardScope
): SQL {
  if (scope.kind === "competition_category" && scope.competitionCategoryIds) {
    return inArray(
      kalakritiCompetitionCategory.id,
      scope.competitionCategoryIds
    );
  }
  if (scope.kind === "competition") {
    return inArray(
      kalakritiCompetitionCategory.id,
      tx
        .select({ id: kalakritiCompetition.competitionCategoryId })
        .from(kalakritiCompetition)
        .where(
          and(
            eq(kalakritiCompetition.editionId, editionId),
            inArray(kalakritiCompetition.id, scope.competitionIds)
          )
        )
    );
  }
  return sql`true`;
}

async function loadKalakritiRegistrationDashboardProjection({
  editionId,
  scope,
  tx,
}: {
  editionId: string;
  scope: KalakritiRegistrationDashboardScope;
  tx: DbTransaction;
}) {
  // The branches map four explicit authorization projections to bounded SQL aggregates.
  const showCenters = scope.kind === "edition" || scope.kind === "center";
  const centers = showCenters
    ? await tx
        .select({ id: kalakritiCenter.id, name: kalakritiCenter.name })
        .from(kalakritiCenter)
        .where(
          and(
            eq(kalakritiCenter.editionId, editionId),
            buildKalakritiRegistrationDashboardCenterCondition(
              scope,
              kalakritiCenter.id
            )
          )
        )
        .orderBy(asc(kalakritiCenter.name))
    : [];
  const ages = await tx
    .select({
      id: kalakritiAgeCategory.id,
      name: kalakritiAgeCategory.name,
      sortOrder: kalakritiAgeCategory.sortOrder,
    })
    .from(kalakritiAgeCategory)
    .where(eq(kalakritiAgeCategory.editionId, editionId))
    .orderBy(asc(kalakritiAgeCategory.sortOrder));
  const categoryScopeCondition =
    buildKalakritiRegistrationDashboardCategoryCondition(tx, editionId, scope);
  const categories = await tx
    .select({
      id: kalakritiCompetitionCategory.id,
      name: kalakritiCompetitionCategory.name,
      sortOrder: kalakritiCompetitionCategory.sortOrder,
    })
    .from(kalakritiCompetitionCategory)
    .where(
      and(
        eq(kalakritiCompetitionCategory.editionId, editionId),
        categoryScopeCondition
      )
    )
    .orderBy(asc(kalakritiCompetitionCategory.sortOrder));
  const competitions = await tx
    .select({
      cancelled: sql<boolean>`${kalakritiCompetition.cancelledAt} is not null`,
      categoryId: kalakritiCompetition.competitionCategoryId,
      categoryRetired: sql<boolean>`${kalakritiCompetitionCategory.retiredAt} is not null`,
      id: kalakritiCompetition.id,
      name: kalakritiCompetition.name,
      retired: sql<boolean>`${kalakritiCompetition.retiredAt} is not null`,
    })
    .from(kalakritiCompetition)
    .innerJoin(
      kalakritiCompetitionCategory,
      and(
        eq(
          kalakritiCompetitionCategory.id,
          kalakritiCompetition.competitionCategoryId
        ),
        eq(
          kalakritiCompetitionCategory.editionId,
          kalakritiCompetition.editionId
        )
      )
    )
    .where(
      and(
        eq(kalakritiCompetition.editionId, editionId),
        buildKalakritiRegistrationDashboardCompetitionCondition(scope)
      )
    )
    .orderBy(asc(kalakritiCompetition.name));
  const competitionIds = competitions.map(({ id }) => id);
  const sessions =
    competitionIds.length > 0
      ? await tx
          .select({
            ageCategoryId: kalakritiCompetitionSession.ageCategoryId,
            cancelled: sql<boolean>`${kalakritiCompetitionSession.cancelledAt} is not null`,
            capacity: kalakritiCompetitionSession.capacity,
            competitionId: kalakritiCompetitionSession.competitionId,
            id: kalakritiCompetitionSession.id,
            venueRetired: sql<boolean>`${kalakritiVenue.retiredAt} is not null`,
          })
          .from(kalakritiCompetitionSession)
          .innerJoin(
            kalakritiVenue,
            and(
              eq(kalakritiVenue.id, kalakritiCompetitionSession.venueId),
              eq(
                kalakritiVenue.editionId,
                kalakritiCompetitionSession.editionId
              )
            )
          )
          .where(
            and(
              eq(kalakritiCompetitionSession.editionId, editionId),
              inArray(kalakritiCompetitionSession.competitionId, competitionIds)
            )
          )
      : [];
  const sessionIds = sessions.map(({ id }) => id);
  const entries =
    sessionIds.length > 0
      ? await tx
          .select({
            centerId: kalakritiCompetitionEntry.centerId,
            entries: countDistinct(kalakritiCompetitionEntry.id),
            participants:
              sql<number>`count(${kalakritiEntryMember.id})`.mapWith(Number),
            sessionId: kalakritiCompetitionEntry.sessionId,
          })
          .from(kalakritiCompetitionEntry)
          .leftJoin(
            kalakritiEntryMember,
            and(
              eq(
                kalakritiEntryMember.editionId,
                kalakritiCompetitionEntry.editionId
              ),
              eq(kalakritiEntryMember.entryId, kalakritiCompetitionEntry.id)
            )
          )
          .where(
            and(
              eq(kalakritiCompetitionEntry.editionId, editionId),
              inArray(kalakritiCompetitionEntry.sessionId, sessionIds),
              buildKalakritiRegistrationDashboardCenterCondition(
                scope,
                kalakritiCompetitionEntry.centerId
              )
            )
          )
          .groupBy(
            kalakritiCompetitionEntry.sessionId,
            kalakritiCompetitionEntry.centerId
          )
      : [];
  const students = showCenters
    ? await tx
        .select({
          ageCategoryId: kalakritiStudent.ageCategoryId,
          centerId: kalakritiStudent.centerId,
          femaleStudents:
            sql<number>`count(distinct ${kalakritiStudent.id}) filter (where ${kalakritiStudent.gender} = 'female')`.mapWith(
              Number
            ),
          maleStudents:
            sql<number>`count(distinct ${kalakritiStudent.id}) filter (where ${kalakritiStudent.gender} = 'male')`.mapWith(
              Number
            ),
          registeredStudents: countDistinct(kalakritiEntryMember.studentId),
          students: countDistinct(kalakritiStudent.id),
        })
        .from(kalakritiStudent)
        .leftJoin(
          kalakritiEntryMember,
          and(
            eq(kalakritiEntryMember.editionId, kalakritiStudent.editionId),
            eq(kalakritiEntryMember.studentId, kalakritiStudent.id)
          )
        )
        .where(
          and(
            eq(kalakritiStudent.editionId, editionId),
            buildKalakritiRegistrationDashboardCenterCondition(
              scope,
              kalakritiStudent.centerId
            )
          )
        )
        .groupBy(kalakritiStudent.centerId, kalakritiStudent.ageCategoryId)
    : [];
  const participants =
    !showCenters && sessionIds.length > 0
      ? await tx
          .select({
            ageCategoryId: kalakritiCompetitionSession.ageCategoryId,
            registeredStudents: countDistinct(kalakritiEntryMember.studentId),
          })
          .from(kalakritiEntryMember)
          .innerJoin(
            kalakritiCompetitionSession,
            and(
              eq(
                kalakritiCompetitionSession.editionId,
                kalakritiEntryMember.editionId
              ),
              eq(kalakritiCompetitionSession.id, kalakritiEntryMember.sessionId)
            )
          )
          .where(
            and(
              eq(kalakritiEntryMember.editionId, editionId),
              inArray(kalakritiEntryMember.sessionId, sessionIds)
            )
          )
          .groupBy(kalakritiCompetitionSession.ageCategoryId)
      : [];
  const quotas = showCenters
    ? await tx
        .select({
          ageCategoryId: kalakritiCenterAgeQuota.ageCategoryId,
          centerId: kalakritiCenterAgeQuota.centerId,
          femaleLimit: kalakritiCenterAgeQuota.femaleStudentLimit,
          maleLimit: kalakritiCenterAgeQuota.maleStudentLimit,
        })
        .from(kalakritiCenterAgeQuota)
        .where(
          and(
            eq(kalakritiCenterAgeQuota.editionId, editionId),
            scope.kind === "center"
              ? inArray(kalakritiCenterAgeQuota.centerId, scope.centerIds)
              : sql`true`
          )
        )
    : [];

  return assembleKalakritiRegistrationDashboardProjection(scope, {
    ages,
    categories,
    centers,
    competitions,
    entries,
    participants,
    quotas,
    sessions,
    students,
  });
}

export function getKalakritiRegistrationDashboardProjections({
  editionId,
  scopes,
}: {
  editionId: string;
  scopes: readonly KalakritiRegistrationDashboardScope[];
}) {
  return db.transaction(
    (tx) =>
      Promise.all(
        scopes.map((scope) =>
          loadKalakritiRegistrationDashboardProjection({
            editionId,
            scope,
            tx,
          })
        )
      ),
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );
}
