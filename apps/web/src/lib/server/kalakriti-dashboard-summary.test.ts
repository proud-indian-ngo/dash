import { describe, expect, it } from "bun:test";

import { db } from "@pi-dash/db";
import {
  kalakritiAttendee,
  kalakritiCenter,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionDivision,
  kalakritiCompetitionEntry,
  kalakritiCompetitionSession,
  kalakritiEdition,
  kalakritiEntryMember,
  kalakritiJudgeAssignment,
  kalakritiOperation,
  kalakritiStudent,
} from "@pi-dash/db/schema/kalakriti";
import { and, eq, isNull, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

import {
  getKalakritiCompetitionSectionForAccess,
  getKalakritiDashboardSummaryForAccess,
  kalakritiDashboardScopeKey,
  type KalakritiDashboardSummary,
} from "./kalakriti-dashboard-summary";

const dbTest = process.env.KALAKRITI_DASHBOARD_DB_TEST === "1" ? it : it.skip;
const rollback = new Error("dashboard-fixture-rollback");

function metric(
  summary: KalakritiDashboardSummary,
  sectionId: string,
  metricId: string
) {
  return summary.sections
    .find((section) => section.id === sectionId)
    ?.metrics.find((item) => item.id === metricId)?.value;
}

function access(
  responsibility:
    | "awards_member"
    | "media_member"
    | "venue_member"
    | "fundraising_member",
  lifecycle: KalakritiEditionAccess["edition"]["lifecycle"] = "registration_open"
): KalakritiEditionAccess {
  return {
    edition: {
      ageCutoffDate: "2027-01-01",
      eventDate: "2027-11-21",
      id: "edition-1",
      lifecycle,
      name: "Kalakriti 2027",
      plannedRegistrationCloseAt: 0,
      teamEventId: "event-1",
      timezone: "Asia/Kolkata",
      year: 2027,
    },
    isGlobalAdmin: false,
    membership: {
      assignments: [
        {
          centerId: null,
          competitionCategoryId: null,
          competitionId: null,
          responsibility,
        },
      ],
      id: "membership-1",
      kind: "volunteer",
      responsibilities: [responsibility],
    },
  };
}

describe("Kalakriti dashboard summary scope", () => {
  it("includes identity and Edition lifecycle in its retention key", () => {
    const current = access("media_member");
    expect(kalakritiDashboardScopeKey("user-a", current)).not.toBe(
      kalakritiDashboardScopeKey("user-b", current)
    );
    expect(kalakritiDashboardScopeKey("user-a", current)).not.toBe(
      kalakritiDashboardScopeKey("user-a", access("media_member", "live"))
    );
    expect(kalakritiDashboardScopeKey("user-a", current)).not.toBe(
      kalakritiDashboardScopeKey("user-a", access("awards_member"))
    );
    expect(
      kalakritiDashboardScopeKey("user-a", current, ["center-a"])
    ).not.toBe(kalakritiDashboardScopeKey("user-a", current, ["center-b"]));
  });

  it.each([
    "awards_member",
    "media_member",
    "venue_member",
    "fundraising_member",
  ] as const)(
    "keeps %s visible without inventing operational access",
    async (role) => {
      const result = await getKalakritiDashboardSummaryForAccess(
        "user-a",
        access(role),
        { loadProjections: async () => [] }
      );
      expect(result.access.membership?.responsibilities).toEqual([role]);
      expect(result.sections).toEqual([]);
    }
  );

  it("omits archived nonadministrator operations", async () => {
    const result = await getKalakritiDashboardSummaryForAccess(
      "user-a",
      access("awards_member", "archived"),
      { loadProjections: async () => [] }
    );
    expect(result.sections).toEqual([]);
  });

  it("returns no Competition section without an authorized Competition assignment", async () => {
    expect(
      await getKalakritiCompetitionSectionForAccess(access("media_member"))
    ).toBeNull();
    expect(
      await getKalakritiCompetitionSectionForAccess(
        access("media_member", "archived")
      )
    ).toBeNull();
  });
});

dbTest(
  "scopes Center meals and Competition attendance with effective operations in PostgreSQL",
  async () => {
    await expect(
      db.transaction(async (tx) => {
        const [edition] = await tx
          .select({
            ageCutoffDate: kalakritiEdition.ageCutoffDate,
            eventDate: kalakritiEdition.eventDate,
            id: kalakritiEdition.id,
            lifecycle: kalakritiEdition.lifecycle,
            name: kalakritiEdition.name,
            plannedRegistrationCloseAt:
              kalakritiEdition.plannedRegistrationCloseAt,
            teamEventId: kalakritiEdition.teamEventId,
            timezone: kalakritiEdition.timezone,
            year: kalakritiEdition.year,
          })
          .from(kalakritiEdition)
          .where(eq(kalakritiEdition.lifecycle, "live"))
          .limit(1);
        expect(edition).toBeDefined();
        if (!edition) return;
        const centerRows = await tx
          .select({
            centerId: kalakritiCenter.id,
            studentId: kalakritiStudent.id,
            actorId: kalakritiStudent.createdBy,
          })
          .from(kalakritiCenter)
          .innerJoin(
            kalakritiStudent,
            eq(kalakritiStudent.centerId, kalakritiCenter.id)
          )
          .where(
            and(
              eq(kalakritiCenter.editionId, edition.id),
              sql`not exists (select 1 from ${kalakritiOperation} op where op.student_id = ${kalakritiStudent.id} and op.type in ('pickup', 'breakfast') and op.superseded_by_operation_id is null)`
            )
          );
        const [first, second] = centerRows.filter(
          (row, index, rows) =>
            rows.findIndex(
              (candidate) => candidate.centerId === row.centerId
            ) === index
        );
        expect(first).toBeDefined();
        expect(second).toBeDefined();
        if (!(first && second)) return;
        const baseEdition = {
          ...edition,
          plannedRegistrationCloseAt:
            edition.plannedRegistrationCloseAt.getTime(),
        };
        const liaison = (centerId: string): KalakritiEditionAccess => ({
          edition: baseEdition,
          isGlobalAdmin: false,
          membership: {
            assignments: [
              {
                centerId,
                competitionCategoryId: null,
                competitionId: null,
                responsibility: "liaison",
              },
            ],
            id: uuidv7(),
            kind: "volunteer",
            responsibilities: ["liaison"],
          },
        });
        const deps = { database: tx, loadProjections: async () => [] };
        const firstBefore = await getKalakritiDashboardSummaryForAccess(
          "fixture-user",
          liaison(first.centerId),
          deps
        );
        const secondBefore = await getKalakritiDashboardSummaryForAccess(
          "fixture-user",
          liaison(second.centerId),
          deps
        );
        const now = new Date();
        const pickupId = uuidv7();
        const breakfastId = uuidv7();
        await tx.insert(kalakritiOperation).values([
          {
            id: pickupId,
            operationId: uuidv7(),
            editionId: edition.id,
            studentId: first.studentId,
            type: "pickup",
            recordedBy: first.actorId,
            createdAt: now,
            occurredAt: now,
          },
          {
            id: breakfastId,
            operationId: uuidv7(),
            editionId: edition.id,
            studentId: first.studentId,
            type: "breakfast",
            recordedBy: first.actorId,
            createdAt: now,
            occurredAt: now,
          },
        ]);
        const firstAfter = await getKalakritiDashboardSummaryForAccess(
          "fixture-user",
          liaison(first.centerId),
          deps
        );
        const secondAfter = await getKalakritiDashboardSummaryForAccess(
          "fixture-user",
          liaison(second.centerId),
          deps
        );
        expect(metric(firstAfter, "food", "eligible")).toBe(
          (metric(firstBefore, "food", "eligible") ?? 0) + 1
        );
        expect(metric(firstAfter, "food", "breakfast")).toBe(
          (metric(firstBefore, "food", "breakfast") ?? 0) + 1
        );
        expect(metric(secondAfter, "food", "eligible")).toBe(
          metric(secondBefore, "food", "eligible")
        );
        expect(metric(secondAfter, "food", "breakfast")).toBe(
          metric(secondBefore, "food", "breakfast")
        );

        const correctionId = uuidv7();
        await tx.insert(kalakritiOperation).values({
          id: correctionId,
          operationId: uuidv7(),
          editionId: edition.id,
          studentId: first.studentId,
          type: "meal_correction",
          recordedBy: first.actorId,
          createdAt: now,
          occurredAt: now,
        });
        await tx
          .update(kalakritiOperation)
          .set({ supersededByOperationId: correctionId })
          .where(eq(kalakritiOperation.id, breakfastId));
        const corrected = await getKalakritiDashboardSummaryForAccess(
          "fixture-user",
          liaison(first.centerId),
          deps
        );
        expect(metric(corrected, "food", "eligible")).toBe(
          metric(firstAfter, "food", "eligible")
        );
        expect(metric(corrected, "food", "breakfast")).toBe(
          metric(firstBefore, "food", "breakfast")
        );

        const [entry] = await tx
          .select({
            competitionId: kalakritiCompetition.id,
            categoryId: kalakritiCompetition.competitionCategoryId,
            entryId: kalakritiCompetitionEntry.id,
            sessionId: kalakritiCompetitionSession.id,
            studentId: kalakritiEntryMember.studentId,
            actorId: kalakritiStudent.createdBy,
          })
          .from(kalakritiCompetitionEntry)
          .innerJoin(
            kalakritiCompetitionDivision,
            eq(
              kalakritiCompetitionDivision.id,
              kalakritiCompetitionEntry.divisionId
            )
          )
          .innerJoin(
            kalakritiCompetition,
            eq(
              kalakritiCompetition.id,
              kalakritiCompetitionDivision.competitionId
            )
          )
          .innerJoin(
            kalakritiCompetitionSession,
            eq(
              kalakritiCompetitionSession.divisionId,
              kalakritiCompetitionDivision.id
            )
          )
          .innerJoin(
            kalakritiEntryMember,
            eq(kalakritiEntryMember.entryId, kalakritiCompetitionEntry.id)
          )
          .innerJoin(
            kalakritiStudent,
            eq(kalakritiStudent.id, kalakritiEntryMember.studentId)
          )
          .where(
            and(
              eq(kalakritiCompetitionEntry.editionId, edition.id),
              eq(kalakritiCompetitionEntry.participationMode, "individual"),
              isNull(kalakritiCompetition.cancelledAt),
              isNull(kalakritiCompetition.retiredAt),
              isNull(kalakritiCompetitionSession.cancelledAt),
              sql`not exists (select 1 from ${kalakritiOperation} op where op.student_id = ${kalakritiEntryMember.studentId} and op.competition_session_id = ${kalakritiCompetitionSession.id} and op.type = 'competition_attendance' and op.superseded_by_operation_id is null)`
            )
          )
          .limit(1);
        expect(entry).toBeDefined();
        if (!entry) return;
        const competitionAccess: KalakritiEditionAccess = {
          edition: baseEdition,
          isGlobalAdmin: false,
          membership: {
            id: uuidv7(),
            kind: "volunteer",
            assignments: [
              {
                centerId: null,
                competitionCategoryId: null,
                competitionId: entry.competitionId,
                responsibility: "competition_volunteer",
              },
            ],
            responsibilities: ["competition_volunteer"],
          },
        };
        const attendanceBefore = await getKalakritiDashboardSummaryForAccess(
          "fixture-user",
          competitionAccess,
          deps
        );
        const categoryAccess: KalakritiEditionAccess = {
          edition: baseEdition,
          isGlobalAdmin: false,
          membership: {
            id: uuidv7(),
            kind: "volunteer",
            assignments: [
              {
                centerId: null,
                competitionCategoryId: entry.categoryId,
                competitionId: null,
                responsibility: "competition_category_lead",
              },
            ],
            responsibilities: ["competition_category_lead"],
          },
        };
        const categorySummary = await getKalakritiDashboardSummaryForAccess(
          "fixture-user",
          categoryAccess,
          deps
        );
        const mixedSummary = await getKalakritiDashboardSummaryForAccess(
          "fixture-user",
          {
            ...categoryAccess,
            membership: {
              ...categoryAccess.membership!,
              assignments: [
                ...categoryAccess.membership!.assignments,
                ...competitionAccess.membership!.assignments,
              ],
              responsibilities: [
                "competition_category_lead",
                "competition_volunteer",
              ],
            },
          },
          deps
        );
        expect(
          metric(categorySummary, "competitions", "competitions")
        ).toBeGreaterThan(0);
        expect(
          mixedSummary.sections.find((section) => section.id === "competitions")
            ?.metrics
        ).toEqual(
          categorySummary.sections.find(
            (section) => section.id === "competitions"
          )?.metrics
        );
        await tx.insert(kalakritiOperation).values({
          id: uuidv7(),
          operationId: uuidv7(),
          editionId: edition.id,
          studentId: entry.studentId,
          competitionSessionId: entry.sessionId,
          type: "competition_attendance",
          recordedBy: entry.actorId,
          createdAt: now,
          occurredAt: now,
        });
        const attendanceAfter = await getKalakritiDashboardSummaryForAccess(
          "fixture-user",
          competitionAccess,
          deps
        );
        expect(metric(attendanceAfter, "attendance", "attended")).toBe(
          (metric(attendanceBefore, "attendance", "attended") ?? 0) + 1
        );
        await tx
          .update(kalakritiCompetitionSession)
          .set({ cancelledAt: now })
          .where(eq(kalakritiCompetitionSession.id, entry.sessionId));
        const unscheduledSummary = await getKalakritiDashboardSummaryForAccess(
          "fixture-user",
          categoryAccess,
          deps
        );
        expect(
          metric(unscheduledSummary, "competitions", "unscheduled_divisions")
        ).toBe(
          (metric(categorySummary, "competitions", "unscheduled_divisions") ??
            0) + 1
        );
        throw rollback;
      })
    ).rejects.toBe(rollback);
  }
);

dbTest(
  "counts only active assigned Judges in the authorized Competition scope",
  async () => {
    await expect(
      db.transaction(async (tx) => {
        const [edition] = await tx
          .select({
            ageCutoffDate: kalakritiEdition.ageCutoffDate,
            eventDate: kalakritiEdition.eventDate,
            id: kalakritiEdition.id,
            lifecycle: kalakritiEdition.lifecycle,
            name: kalakritiEdition.name,
            plannedRegistrationCloseAt:
              kalakritiEdition.plannedRegistrationCloseAt,
            teamEventId: kalakritiEdition.teamEventId,
            timezone: kalakritiEdition.timezone,
            year: kalakritiEdition.year,
          })
          .from(kalakritiEdition)
          .where(eq(kalakritiEdition.lifecycle, "live"))
          .limit(1);
        expect(edition).toBeDefined();
        if (!edition) return;
        const [competition] = await tx
          .select({ id: kalakritiCompetition.id })
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
              eq(kalakritiCompetition.editionId, edition.id),
              isNull(kalakritiCompetition.cancelledAt),
              isNull(kalakritiCompetition.retiredAt),
              isNull(kalakritiCompetitionCategory.retiredAt),
              sql`not exists (select 1 from ${kalakritiJudgeAssignment} ja inner join ${kalakritiAttendee} judge on judge.id = ja.attendee_id where ja.competition_id = ${kalakritiCompetition.id} and judge.kind = 'judge' and judge.archived_at is null)`
            )
          )
          .limit(1);
        expect(competition).toBeDefined();
        if (!competition) return;
        const baseEdition = {
          ...edition,
          plannedRegistrationCloseAt:
            edition.plannedRegistrationCloseAt.getTime(),
        };
        const scopedAccess: KalakritiEditionAccess = {
          edition: baseEdition,
          isGlobalAdmin: false,
          membership: {
            id: uuidv7(),
            kind: "volunteer",
            assignments: [
              {
                centerId: null,
                competitionCategoryId: null,
                competitionId: competition.id,
                responsibility: "competition_coordinator",
              },
            ],
            responsibilities: ["competition_coordinator"],
          },
        };
        const metricValue = (
          section: Awaited<
            ReturnType<typeof getKalakritiCompetitionSectionForAccess>
          >
        ) =>
          section?.metrics.find((item) => item.id === "missing_judges")?.value;
        const before = await getKalakritiCompetitionSectionForAccess(
          scopedAccess,
          tx
        );
        expect(metricValue(before)).toBe(1);
        expect(
          await getKalakritiCompetitionSectionForAccess(
            {
              ...scopedAccess,
              edition: { ...baseEdition, lifecycle: "archived" },
            },
            tx
          )
        ).toBeNull();
        const global = await getKalakritiCompetitionSectionForAccess(
          { edition: baseEdition, isGlobalAdmin: true, membership: null },
          tx
        );
        expect(metricValue(global)).toBeGreaterThanOrEqual(1);

        const now = new Date();
        const judgeId = uuidv7();
        const assignmentId = uuidv7();
        await tx.insert(kalakritiAttendee).values({
          id: judgeId,
          editionId: edition.id,
          kind: "judge",
          humanId: uuidv7(),
          name: "Fixture Judge",
          phone: "0000000000",
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(kalakritiJudgeAssignment).values({
          id: assignmentId,
          editionId: edition.id,
          attendeeId: judgeId,
          competitionId: competition.id,
          createdAt: now,
        });
        expect(
          metricValue(
            await getKalakritiCompetitionSectionForAccess(scopedAccess, tx)
          )
        ).toBe(0);
        await tx
          .update(kalakritiAttendee)
          .set({ archivedAt: now })
          .where(eq(kalakritiAttendee.id, judgeId));
        expect(
          metricValue(
            await getKalakritiCompetitionSectionForAccess(scopedAccess, tx)
          )
        ).toBe(1);
        await tx
          .delete(kalakritiJudgeAssignment)
          .where(eq(kalakritiJudgeAssignment.id, assignmentId));
        await tx
          .update(kalakritiAttendee)
          .set({ archivedAt: null })
          .where(eq(kalakritiAttendee.id, judgeId));
        expect(
          metricValue(
            await getKalakritiCompetitionSectionForAccess(scopedAccess, tx)
          )
        ).toBe(1);
        throw rollback;
      })
    ).rejects.toBe(rollback);
  }
);
