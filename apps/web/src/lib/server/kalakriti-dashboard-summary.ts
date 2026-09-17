import { db } from "@pi-dash/db";
import {
  kalakritiAssignment,
  kalakritiAttendee,
  kalakritiCenter,
  kalakritiCenterScanStage,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionDivision,
  kalakritiCompetitionEntry,
  kalakritiCompetitionSession,
  kalakritiEditionMembership,
  kalakritiEdition,
  kalakritiEntryMember,
  kalakritiGuardianCenter,
  kalakritiJudgeAssignment,
  kalakritiOperation,
  kalakritiStudent,
  kalakritiTransportAssignment,
} from "@pi-dash/db/schema/kalakriti";
import { kalakritiInventoryItem } from "@pi-dash/db/schema/kalakriti-inventory";
import { kalakritiResult } from "@pi-dash/db/schema/kalakriti-results";
import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { canAccessKalakritiCenterRegistration } from "@/lib/kalakriti-center-registration-policy";
import { getKalakritiScanActivities } from "@/lib/kalakriti-event-day-policy";
import {
  canViewKalakritiFood,
  canViewKalakritiFoodAttendees,
} from "@/lib/kalakriti-food-policy";
import { canViewKalakritiInventory } from "@/lib/kalakriti-inventory-policy";
import { resolveKalakritiRegistrationScopes } from "@/lib/kalakriti-registration-scope-policy";
import { canViewKalakritiTransport } from "@/lib/kalakriti-transport-policy";
import { canManageKalakritiVolunteers } from "@/lib/kalakriti-volunteer-policy";
import { getKalakritiRegistrationDashboardProjections } from "@/lib/server/kalakriti-registration-dashboard";

type DashboardDb = Pick<
  Parameters<Parameters<typeof db.transaction>[0]>[0],
  "select"
>;

export type KalakritiDashboardSectionId =
  | "registration"
  | "competitions"
  | "volunteers"
  | "food"
  | "transport"
  | "inventory"
  | "hospitality"
  | "attendance";

export interface KalakritiDashboardSection {
  id: KalakritiDashboardSectionId;
  title: string;
  scopeLabel: string;
  metrics: Array<{ id: string; label: string; value: number; total?: number }>;
  attention: Array<{
    id: string;
    label: string;
    count: number;
    destination:
      | "students"
      | "volunteers"
      | "food"
      | "transport"
      | "inventory"
      | "scan";
    filter?: string;
    activity?:
      | "transport"
      | "check_in"
      | "meals"
      | "attendance"
      | "dispatch"
      | "return";
  }>;
}

export interface KalakritiDashboardSummary {
  access: KalakritiEditionAccess;
  projections: Awaited<
    ReturnType<typeof getKalakritiRegistrationDashboardProjections>
  >;
  scopeKey: string;
  updatedAt: number;
  sections: KalakritiDashboardSection[];
}

const countWhere = (condition: SQL) =>
  sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
const number = (value: number | null | undefined) => Number(value ?? 0);
const attention = (
  id: string,
  label: string,
  count: number,
  destination: KalakritiDashboardSection["attention"][number]["destination"],
  filter?: string,
  activity?: KalakritiDashboardSection["attention"][number]["activity"]
) => (count > 0 ? [{ id, label, count, destination, filter, activity }] : []);

const studentOperation = (type: string, editionId: string) =>
  sql`exists (select 1 from ${kalakritiOperation} op where op.edition_id = ${editionId} and op.student_id = ${kalakritiStudent.id} and op.type = ${type} and op.superseded_by_operation_id is null)`;
const membershipOperation = (type: string, editionId: string) =>
  sql`exists (select 1 from ${kalakritiOperation} op where op.edition_id = ${editionId} and op.membership_id = ${kalakritiEditionMembership.id} and op.type = ${type} and op.superseded_by_operation_id is null)`;
const attendeeOperation = (type: string, editionId: string) =>
  sql`exists (select 1 from ${kalakritiOperation} op where op.edition_id = ${editionId} and op.attendee_id = ${kalakritiAttendee.id} and op.type = ${type} and op.superseded_by_operation_id is null)`;

export function kalakritiDashboardScopeKey(
  userId: string,
  access: KalakritiEditionAccess,
  centerIds: readonly string[] = []
) {
  return JSON.stringify([
    userId,
    access.edition.id,
    access.edition.lifecycle,
    access.isGlobalAdmin,
    access.membership?.id,
    access.membership?.kind,
    access.membership?.assignments
      .map((a) => [
        a.responsibility,
        a.centerId,
        a.competitionCategoryId,
        a.competitionId,
      ])
      .sort(),
    [...centerIds].sort(),
  ]);
}

async function assignedCenterIds(
  access: KalakritiEditionAccess,
  database: DashboardDb
): Promise<string[]> {
  const ids = new Set(
    access.membership?.assignments.flatMap((a) =>
      a.centerId ? [a.centerId] : []
    ) ?? []
  );
  if (access.membership?.kind === "guardian") {
    const rows = await database
      .select({ id: kalakritiGuardianCenter.centerId })
      .from(kalakritiGuardianCenter)
      .where(
        and(
          eq(kalakritiGuardianCenter.editionId, access.edition.id),
          eq(kalakritiGuardianCenter.membershipId, access.membership.id)
        )
      );
    for (const row of rows) ids.add(row.id);
  }
  return [...ids].sort();
}

async function volunteers(
  access: KalakritiEditionAccess,
  database: DashboardDb
): Promise<KalakritiDashboardSection> {
  const editionId = access.edition.id;
  const active = and(
    eq(kalakritiEditionMembership.editionId, editionId),
    eq(kalakritiEditionMembership.kind, "volunteer"),
    eq(kalakritiEditionMembership.state, "active")
  );
  const unassigned = sql`not exists (select 1 from ${kalakritiAssignment} a where a.edition_id = ${editionId} and a.membership_id = ${kalakritiEditionMembership.id})`;
  const [row] = await database
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      unassigned: countWhere(unassigned),
    })
    .from(kalakritiEditionMembership)
    .where(active);
  return {
    id: "volunteers",
    title: "Volunteers",
    scopeLabel: "Edition",
    metrics: [
      { id: "active", label: "Active volunteers", value: number(row?.total) },
      {
        id: "unassigned",
        label: "Without responsibilities",
        value: number(row?.unassigned),
      },
    ],
    attention: attention(
      "unassigned",
      "Volunteers need responsibilities",
      number(row?.unassigned),
      "volunteers",
      "unassigned"
    ),
  };
}

async function registration(
  access: KalakritiEditionAccess,
  centerIds: string[],
  database: DashboardDb
): Promise<KalakritiDashboardSection | null> {
  const all =
    access.isGlobalAdmin ||
    access.membership?.responsibilities.some(
      (r) => r === "edition_admin" || r === "liaison_lead"
    );
  if (!all && centerIds.length === 0) return null;
  const editionId = access.edition.id;
  const [config] = await database
    .select({ minimum: kalakritiEdition.minTotalCompetitions })
    .from(kalakritiEdition)
    .where(eq(kalakritiEdition.id, editionId));
  const minimum = config?.minimum ?? 2;
  const participationCount = sql`(select count(*) from ${kalakritiEntryMember} em where em.edition_id = ${editionId} and em.student_id = ${kalakritiStudent.id})`;
  const [row] = await database
    .select({
      students: sql<number>`count(*)`.mapWith(Number),
      withoutEntries: countWhere(sql`${participationCount} = 0`),
      shortfall: countWhere(sql`${participationCount} < ${minimum}`),
      entries: sql<number>`coalesce(sum(${participationCount}), 0)`.mapWith(
        Number
      ),
    })
    .from(kalakritiStudent)
    .where(
      and(
        eq(kalakritiStudent.editionId, editionId),
        ...(all ? [] : [inArray(kalakritiStudent.centerId, centerIds)])
      )
    );
  return {
    id: "registration",
    title: "Participation",
    scopeLabel: all ? "Edition" : "Assigned Centers",
    metrics: [
      { id: "students", label: "Students", value: number(row?.students) },
      {
        id: "entries",
        label: "Student participations",
        value: number(row?.entries),
      },
      {
        id: "without_entries",
        label: "Without Entries",
        value: number(row?.withoutEntries),
      },
      {
        id: "participation_shortfall",
        label: `Below ${minimum} Competitions`,
        value: number(row?.shortfall),
      },
    ],
    attention: [
      ...attention(
        "without_entries",
        "Students without Entries",
        number(row?.withoutEntries),
        "students",
        "without_entries"
      ),
      ...attention(
        "participation_shortfall",
        "Students below participation minimum",
        number(row?.shortfall),
        "students",
        "participation_shortfall"
      ),
    ],
  };
}

async function inventory(
  access: KalakritiEditionAccess,
  database: DashboardDb
): Promise<KalakritiDashboardSection> {
  const [row] = await database
    .select({
      items: sql<number>`count(*)`.mapWith(Number),
      empty: countWhere(eq(kalakritiInventoryItem.quantity, 0)),
      quantity:
        sql<number>`coalesce(sum(${kalakritiInventoryItem.quantity}), 0)`.mapWith(
          Number
        ),
    })
    .from(kalakritiInventoryItem)
    .where(
      and(
        eq(kalakritiInventoryItem.editionId, access.edition.id),
        isNull(kalakritiInventoryItem.archivedAt)
      )
    );
  return {
    id: "inventory",
    title: "Inventory",
    scopeLabel: "Edition",
    metrics: [
      { id: "items", label: "Active items", value: number(row?.items) },
      { id: "quantity", label: "Units on hand", value: number(row?.quantity) },
      { id: "empty", label: "Out of stock", value: number(row?.empty) },
    ],
    attention: attention(
      "out_of_stock",
      "Items out of stock",
      number(row?.empty),
      "inventory",
      "out_of_stock"
    ),
  };
}

async function transport(
  access: KalakritiEditionAccess,
  centerIds: string[],
  database: DashboardDb
): Promise<KalakritiDashboardSection | null> {
  const all =
    access.isGlobalAdmin ||
    access.membership?.responsibilities.some(
      (r) => r === "edition_admin" || r === "transport_lead"
    );
  if (!all && centerIds.length === 0) return null;
  const assignmentExists = sql`exists (select 1 from ${kalakritiTransportAssignment} t where t.edition_id = ${access.edition.id} and t.center_id = ${kalakritiCenter.id} and t.deleted_at is null)`;
  const centerWhere = and(
    eq(kalakritiCenter.editionId, access.edition.id),
    isNull(kalakritiCenter.retiredAt),
    ...(all ? [] : [inArray(kalakritiCenter.id, centerIds)])
  );
  const [centers, status] = await Promise.all([
    database
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        missing: countWhere(sql`not ${assignmentExists}`),
      })
      .from(kalakritiCenter)
      .where(centerWhere),
    database
      .select({
        stage: kalakritiCenterScanStage.stage,
        total:
          sql<number>`count(distinct ${kalakritiCenterScanStage.centerId})`.mapWith(
            Number
          ),
      })
      .from(kalakritiCenterScanStage)
      .innerJoin(
        kalakritiCenter,
        eq(kalakritiCenter.id, kalakritiCenterScanStage.centerId)
      )
      .where(
        and(
          centerWhere,
          sql`${kalakritiCenterScanStage.finalizedAt} is not null`
        )
      )
      .groupBy(kalakritiCenterScanStage.stage),
  ]);
  const row = centers[0];
  return {
    id: "transport",
    title: "Transport",
    scopeLabel: all ? "Edition" : "Assigned Centers",
    metrics: [
      { id: "centers", label: "Active Centers", value: number(row?.total) },
      {
        id: "missing_vehicles",
        label: "Without vehicles",
        value: number(row?.missing),
      },
      ...status.map((s) => ({
        id: s.stage,
        label: `${s.stage.replaceAll("_", " ")} finalized`,
        value: number(s.total),
      })),
    ],
    attention: attention(
      "missing_vehicle",
      "Centers need vehicles",
      number(row?.missing),
      "transport",
      "missing_vehicle"
    ),
  };
}

async function hospitality(
  access: KalakritiEditionAccess,
  database: DashboardDb
): Promise<KalakritiDashboardSection> {
  const editionId = access.edition.id;
  const checkedVolunteer = membershipOperation("volunteer_check_in", editionId);
  const checkedAttendee = attendeeOperation("attendee_check_in", editionId);
  const [volunteers, attendees] = await Promise.all([
    database
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        checked: countWhere(checkedVolunteer),
      })
      .from(kalakritiEditionMembership)
      .where(
        and(
          eq(kalakritiEditionMembership.editionId, editionId),
          eq(kalakritiEditionMembership.kind, "volunteer"),
          eq(kalakritiEditionMembership.state, "active")
        )
      ),
    database
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        checked: countWhere(checkedAttendee),
      })
      .from(kalakritiAttendee)
      .where(
        and(
          eq(kalakritiAttendee.editionId, editionId),
          isNull(kalakritiAttendee.archivedAt)
        )
      ),
  ]);
  const total = number(volunteers[0]?.total) + number(attendees[0]?.total);
  const checked =
    number(volunteers[0]?.checked) + number(attendees[0]?.checked);
  return {
    id: "hospitality",
    title: "Check-in",
    scopeLabel: "Edition",
    metrics: [
      { id: "checked_in", label: "Checked in", value: checked, total },
      { id: "awaiting", label: "Awaiting check-in", value: total - checked },
    ],
    attention: attention(
      "awaiting_check_in",
      "People awaiting check-in",
      total - checked,
      "scan",
      undefined,
      "check_in"
    ),
  };
}

async function food(
  access: KalakritiEditionAccess,
  centerIds: string[],
  database: DashboardDb
): Promise<KalakritiDashboardSection | null> {
  const editionId = access.edition.id;
  const allMembers = Boolean(
    access.isGlobalAdmin ||
    access.membership?.responsibilities.some((r) =>
      ["edition_admin", "food_lead", "food_member"].includes(r)
    )
  );
  const allCenters =
    allMembers ||
    access.membership?.responsibilities.includes("liaison_lead") === true;
  if (!allCenters && centerIds.length === 0) return null;
  const studentWhere = and(
    eq(kalakritiStudent.editionId, editionId),
    ...(allCenters ? [] : [inArray(kalakritiStudent.centerId, centerIds)])
  );
  const guardianLink = allCenters
    ? sql`true`
    : inArray(sql`gc.center_id`, centerIds);
  const assignmentLink = allCenters
    ? sql`true`
    : inArray(sql`a.center_id`, centerIds);
  const memberScope = allMembers
    ? sql`true`
    : sql`${kalakritiEditionMembership.id} = ${access.membership?.kind === "guardian" ? access.membership.id : "00000000-0000-0000-0000-000000000000"} or exists (select 1 from ${kalakritiGuardianCenter} gc where gc.edition_id = ${editionId} and gc.membership_id = ${kalakritiEditionMembership.id} and ${guardianLink}) or exists (select 1 from ${kalakritiAssignment} a where a.edition_id = ${editionId} and a.membership_id = ${kalakritiEditionMembership.id} and a.center_id is not null and ${assignmentLink})`;
  const memberWhere = and(
    eq(kalakritiEditionMembership.editionId, editionId),
    sql`(${memberScope})`,
    sql`(${kalakritiEditionMembership.state} = 'active' or ${membershipOperation("breakfast", editionId)} or ${membershipOperation("lunch", editionId)})`
  );
  const studentEligible = studentOperation("pickup", editionId);
  const memberEligible = sql`${kalakritiEditionMembership.state} = 'active' and (${kalakritiEditionMembership.kind} = 'guardian' or ${membershipOperation("volunteer_check_in", editionId)})`;
  const attendeeEligible = sql`${kalakritiAttendee.archivedAt} is null and ${attendeeOperation("attendee_check_in", editionId)}`;
  const [students, members, attendees] = await Promise.all([
    database
      .select({
        eligible: countWhere(studentEligible),
        breakfast: countWhere(studentOperation("breakfast", editionId)),
        lunch: countWhere(studentOperation("lunch", editionId)),
        awaitingBreakfast: countWhere(
          sql`${studentEligible} and not ${studentOperation("breakfast", editionId)}`
        ),
        awaitingLunch: countWhere(
          sql`${studentEligible} and not ${studentOperation("lunch", editionId)}`
        ),
      })
      .from(kalakritiStudent)
      .where(studentWhere),
    database
      .select({
        eligible: countWhere(memberEligible),
        breakfast: countWhere(membershipOperation("breakfast", editionId)),
        lunch: countWhere(membershipOperation("lunch", editionId)),
        awaitingBreakfast: countWhere(
          sql`${memberEligible} and not ${membershipOperation("breakfast", editionId)}`
        ),
        awaitingLunch: countWhere(
          sql`${memberEligible} and not ${membershipOperation("lunch", editionId)}`
        ),
      })
      .from(kalakritiEditionMembership)
      .where(memberWhere),
    canViewKalakritiFoodAttendees(access)
      ? database
          .select({
            eligible: countWhere(attendeeEligible),
            breakfast: countWhere(attendeeOperation("breakfast", editionId)),
            lunch: countWhere(attendeeOperation("lunch", editionId)),
            awaitingBreakfast: countWhere(
              sql`${attendeeEligible} and not ${attendeeOperation("breakfast", editionId)}`
            ),
            awaitingLunch: countWhere(
              sql`${attendeeEligible} and not ${attendeeOperation("lunch", editionId)}`
            ),
          })
          .from(kalakritiAttendee)
          .where(eq(kalakritiAttendee.editionId, editionId))
      : Promise.resolve([]),
  ]);
  const parts = [students[0], members[0], attendees[0]];
  const sum = (
    key:
      | "eligible"
      | "breakfast"
      | "lunch"
      | "awaitingBreakfast"
      | "awaitingLunch"
  ) => parts.reduce((n, p) => n + number(p?.[key]), 0);
  return {
    id: "food",
    title: "Meals",
    scopeLabel: allMembers
      ? "Edition"
      : allCenters
        ? "Center-linked people"
        : "Assigned Centers",
    metrics: [
      { id: "eligible", label: "Eligible", value: sum("eligible") },
      {
        id: "breakfast",
        label: "Breakfast served",
        value: sum("breakfast"),
        total: sum("eligible"),
      },
      {
        id: "lunch",
        label: "Lunch served",
        value: sum("lunch"),
        total: sum("eligible"),
      },
    ],
    attention: [
      ...attention(
        "breakfast_pending",
        "Breakfast pending",
        sum("awaitingBreakfast"),
        "food",
        "breakfast_pending"
      ),
      ...attention(
        "lunch_pending",
        "Lunch pending",
        sum("awaitingLunch"),
        "food",
        "lunch_pending"
      ),
    ],
  };
}

async function competitions(
  access: KalakritiEditionAccess,
  database: DashboardDb
): Promise<KalakritiDashboardSection | null> {
  const all =
    access.isGlobalAdmin ||
    access.membership?.responsibilities.some(
      (role) => role === "edition_admin" || role === "overall_events_lead"
    );
  const categoryIds = [
    ...new Set(
      access.membership?.assignments.flatMap((assignment) =>
        assignment.responsibility === "competition_category_lead" &&
        assignment.competitionCategoryId
          ? [assignment.competitionCategoryId]
          : []
      ) ?? []
    ),
  ];
  const competitionIds = [
    ...new Set(
      access.membership?.assignments.flatMap((assignment) =>
        assignment.competitionId &&
        ["competition_coordinator", "competition_volunteer"].includes(
          assignment.responsibility
        )
          ? [assignment.competitionId]
          : []
      ) ?? []
    ),
  ];
  if (!all && categoryIds.length === 0 && competitionIds.length === 0)
    return null;
  const scoped = all
    ? sql`true`
    : or(
        categoryIds.length > 0
          ? inArray(kalakritiCompetition.competitionCategoryId, categoryIds)
          : undefined,
        competitionIds.length > 0
          ? inArray(kalakritiCompetition.id, competitionIds)
          : undefined
      );
  const rows = await database
    .select({
      divisions:
        sql<number>`(select count(*) from ${kalakritiCompetitionDivision} d where d.competition_id = ${kalakritiCompetition.id})`.mapWith(
          Number
        ),
      unscheduled:
        sql<number>`(select count(*) from ${kalakritiCompetitionDivision} d where d.competition_id = ${kalakritiCompetition.id} and not exists (select 1 from ${kalakritiCompetitionSession} s where s.division_id = d.id and s.cancelled_at is null))`.mapWith(
          Number
        ),
      entries:
        sql<number>`(select count(*) from ${kalakritiCompetitionEntry} e inner join ${kalakritiCompetitionDivision} d on d.id = e.division_id where d.competition_id = ${kalakritiCompetition.id})`.mapWith(
          Number
        ),
      published:
        sql<number>`(select count(*) from ${kalakritiCompetitionDivision} d inner join ${kalakritiResult} r on r.division_id = d.id and r.status = 'published' where d.competition_id = ${kalakritiCompetition.id})`.mapWith(
          Number
        ),
      hasActiveJudge: sql<boolean>`exists (select 1 from ${kalakritiJudgeAssignment} ja inner join ${kalakritiAttendee} judge on judge.id = ja.attendee_id where ja.edition_id = ${access.edition.id} and ja.competition_id = ${kalakritiCompetition.id} and judge.edition_id = ja.edition_id and judge.kind = 'judge' and judge.archived_at is null)`,
    })
    .from(kalakritiCompetition)
    .innerJoin(
      kalakritiCompetitionCategory,
      eq(
        kalakritiCompetitionCategory.id,
        kalakritiCompetition.competitionCategoryId
      )
    )
    .where(
      and(
        eq(kalakritiCompetition.editionId, access.edition.id),
        isNull(kalakritiCompetition.cancelledAt),
        isNull(kalakritiCompetition.retiredAt),
        isNull(kalakritiCompetitionCategory.retiredAt),
        scoped
      )
    );
  const sum = (field: "divisions" | "unscheduled" | "entries" | "published") =>
    rows.reduce((total, row) => total + number(row[field]), 0);
  return {
    id: "competitions",
    title: "Competitions",
    scopeLabel: all ? "Edition" : "Assigned Competitions",
    metrics: [
      { id: "competitions", label: "Active Competitions", value: rows.length },
      { id: "entries", label: "Entries", value: sum("entries") },
      {
        id: "missing_judges",
        label: "Without active Judges",
        value: rows.filter((row) => !row.hasActiveJudge).length,
      },
      {
        id: "missing_divisions",
        label: "Without Divisions",
        value: rows.filter((row) => number(row.divisions) === 0).length,
      },
      {
        id: "unscheduled_divisions",
        label: "Divisions needing Sessions",
        value: sum("unscheduled"),
      },
      {
        id: "published_results",
        label: "Published results",
        value: sum("published"),
        total: sum("divisions"),
      },
    ],
    attention: [],
  };
}

export function getKalakritiCompetitionSectionForAccess(
  access: KalakritiEditionAccess,
  database: DashboardDb = db
): Promise<KalakritiDashboardSection | null> {
  if (access.edition.lifecycle === "archived" && !access.isGlobalAdmin)
    return Promise.resolve(null);
  return competitions(access, database);
}

async function attendance(
  access: KalakritiEditionAccess,
  database: DashboardDb
): Promise<KalakritiDashboardSection | null> {
  const all =
    access.isGlobalAdmin ||
    access.membership?.responsibilities.includes("edition_admin");
  const competitionIds = [
    ...new Set(
      access.membership?.assignments.flatMap((a) =>
        a.competitionId &&
        ["competition_coordinator", "competition_volunteer"].includes(
          a.responsibility
        )
          ? [a.competitionId]
          : []
      ) ?? []
    ),
  ];
  if (!all && competitionIds.length === 0) return null;
  const editionId = access.edition.id;
  const fullyAttended = sql`exists (select 1 from ${kalakritiEntryMember} em where em.entry_id = ${kalakritiCompetitionEntry.id}) and not exists (select 1 from ${kalakritiEntryMember} em where em.entry_id = ${kalakritiCompetitionEntry.id} and not exists (select 1 from ${kalakritiOperation} op where op.student_id = em.student_id and op.edition_id = ${editionId} and op.type = 'competition_attendance' and op.superseded_by_operation_id is null and op.competition_session_id = ${kalakritiCompetitionSession.id}))`;
  const [row] = await database
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      attended: countWhere(fullyAttended),
    })
    .from(kalakritiCompetitionEntry)
    .innerJoin(
      kalakritiCompetitionDivision,
      eq(kalakritiCompetitionDivision.id, kalakritiCompetitionEntry.divisionId)
    )
    .innerJoin(
      kalakritiCompetition,
      eq(kalakritiCompetition.id, kalakritiCompetitionDivision.competitionId)
    )
    .innerJoin(
      kalakritiCompetitionSession,
      eq(
        kalakritiCompetitionSession.divisionId,
        kalakritiCompetitionDivision.id
      )
    )
    .where(
      and(
        eq(kalakritiCompetitionEntry.editionId, editionId),
        isNull(kalakritiCompetition.cancelledAt),
        isNull(kalakritiCompetition.retiredAt),
        isNull(kalakritiCompetitionSession.cancelledAt),
        ...(all ? [] : [inArray(kalakritiCompetition.id, competitionIds)])
      )
    );
  const total = number(row?.total);
  const attended = number(row?.attended);
  return {
    id: "attendance",
    title: "Competition attendance",
    scopeLabel: all ? "Edition" : "Assigned Competitions",
    metrics: [
      {
        id: "attended",
        label: "Fully attended Entries",
        value: attended,
        total,
      },
      {
        id: "pending",
        label: "Entries with attendance pending",
        value: total - attended,
      },
    ],
    attention: attention(
      "attendance_pending",
      "Entries awaiting attendance",
      total - attended,
      "scan",
      undefined,
      "attendance"
    ),
  };
}

export async function getKalakritiDashboardSummaryForAccess(
  userId: string,
  access: KalakritiEditionAccess,
  {
    database = db,
    loadProjections = getKalakritiRegistrationDashboardProjections,
  }: {
    database?: DashboardDb;
    loadProjections?: typeof getKalakritiRegistrationDashboardProjections;
  } = {}
): Promise<KalakritiDashboardSummary> {
  const sections: KalakritiDashboardSection[] = [];
  const archived = access.edition.lifecycle === "archived";
  const centers = archived ? [] : await assignedCenterIds(access, database);
  const scopes = resolveKalakritiRegistrationScopes(
    access,
    access.membership?.kind === "guardian" ? centers : []
  );
  const projections = await loadProjections({
    editionId: access.edition.id,
    scopes,
  });
  const scans = getKalakritiScanActivities(access);
  if (!archived || access.isGlobalAdmin) {
    if (
      canAccessKalakritiCenterRegistration(access) &&
      (!archived || access.isGlobalAdmin)
    ) {
      const section = await registration(access, centers, database);
      if (section) sections.push(section);
    }
    if (
      canManageKalakritiVolunteers(access) &&
      (!archived || access.isGlobalAdmin)
    )
      sections.push(await volunteers(access, database));
    if (canViewKalakritiFood(access)) {
      const section = await food(access, centers, database);
      if (section) sections.push(section);
    }
    if (canViewKalakritiTransport(access)) {
      const section = await transport(access, centers, database);
      if (section) sections.push(section);
    }
    if (canViewKalakritiInventory(access))
      sections.push(await inventory(access, database));
    const competitionSection = await getKalakritiCompetitionSectionForAccess(
      access,
      database
    );
    if (competitionSection) sections.push(competitionSection);
    if (scans.includes("check_in"))
      sections.push(await hospitality(access, database));
    if (scans.includes("attendance") || access.isGlobalAdmin) {
      const section = await attendance(access, database);
      if (section) sections.push(section);
    }
  }
  if (archived) {
    for (const section of sections) section.attention = [];
  }
  return {
    access,
    projections,
    scopeKey: kalakritiDashboardScopeKey(userId, access, centers),
    updatedAt: Date.now(),
    sections,
  };
}
