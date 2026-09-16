import { db } from "@pi-dash/db";
import {
  kalakritiAgeCategory,
  kalakritiCenter,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionDivision,
  kalakritiCompetitionEntry,
  kalakritiCompetitionSession,
  kalakritiEdition,
  kalakritiEntryMember,
  kalakritiOperation,
  kalakritiStudent,
} from "@pi-dash/db/schema/kalakriti";
import {
  kalakritiResult,
  kalakritiResultRevision,
  kalakritiResultScorecard,
  kalakritiResultsState,
} from "@pi-dash/db/schema/kalakriti-results";
import {
  canManageKalakritiResults,
  rankKalakritiCenters,
  type CenterStanding,
} from "@pi-dash/shared/kalakriti-results";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createRequestLogger } from "evlog";
import z from "zod";

import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";
import { authMiddleware } from "@/middleware/auth";

export interface KalakritiResultDetail {
  editionId: string;
  divisionId: string;
  canWrite: boolean;
  version: number;
  resultId: string | null;
  status: "draft" | "published";
  winnerEntryId: string | null;
  runnerUpEntryId: string | null;
  scorecards: {
    id: string;
    fileName: string;
    mimeType: string;
    byteSize: number;
  }[];
  entries: {
    id: string;
    label: string;
    centerName: string;
    eligible: boolean;
  }[];
  revisions: {
    version: number;
    status: "draft" | "published";
    winnerEntryId: string | null;
    runnerUpEntryId: string | null;
    createdAt: number;
  }[];
}

export interface KalakritiStandings {
  editionId: string;
  version: number;
  canFinalize: boolean;
  canWrite: boolean;
  finalizedAt: number | null;
  winnerCenterId: string | null;
  runnerUpCenterId: string | null;
  winnerPoints: number;
  runnerUpPoints: number;
  publishedCount: number;
  totalCount: number;
  centers: CenterStanding[];
}

const yearSchema = z.object({ year: z.number().int().min(2000).max(2200) });

export const getKalakritiStandings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(yearSchema)
  .handler(async ({ context, data }): Promise<KalakritiStandings> => {
    if (!context.session) throw new Error("Unauthorized");
    const log = createRequestLogger();
    log.set({
      handler: "getKalakritiStandings",
      userId: context.session.user.id,
      year: data.year,
    });
    try {
      const access = await resolveKalakritiEditionAccess({
        userId: context.session.user.id,
        role: context.session.user.role ?? "unoriented_volunteer",
        year: data.year,
      });
      if (
        !access ||
        (access.edition.lifecycle === "archived" && !access.isGlobalAdmin)
      )
        throw new Error("Unauthorized");
      const editionId = access.edition.id;
      return await db.transaction(
        async (tx) => {
          const [edition] = await tx
            .select({
              winnerPoints: kalakritiEdition.winnerPoints,
              runnerUpPoints: kalakritiEdition.runnerUpPoints,
              lifecycle: kalakritiEdition.lifecycle,
            })
            .from(kalakritiEdition)
            .where(eq(kalakritiEdition.id, editionId));
          if (!edition) throw new Error("Edition not found");
          const [state] = await tx
            .select()
            .from(kalakritiResultsState)
            .where(eq(kalakritiResultsState.editionId, editionId));
          const centers = await tx
            .select({ id: kalakritiCenter.id, name: kalakritiCenter.name })
            .from(kalakritiCenter)
            .where(
              and(
                eq(kalakritiCenter.editionId, editionId),
                isNull(kalakritiCenter.retiredAt)
              )
            );
          const winner = alias(kalakritiCompetitionEntry, "winning_entry");
          const runner = alias(kalakritiCompetitionEntry, "runner_entry");
          // The general dashboard receives Center aggregates only, never Entry or Student rows.
          const events = await tx
            .select({
              divisionId: kalakritiCompetitionDivision.id,
              status: kalakritiResult.status,
              winnerCenterId: winner.centerId,
              runnerUpCenterId: runner.centerId,
            })
            .from(kalakritiCompetitionDivision)
            .innerJoin(
              kalakritiCompetition,
              eq(
                kalakritiCompetition.id,
                kalakritiCompetitionDivision.competitionId
              )
            )
            .innerJoin(
              kalakritiCompetitionCategory,
              eq(
                kalakritiCompetitionCategory.id,
                kalakritiCompetition.competitionCategoryId
              )
            )
            .innerJoin(
              kalakritiAgeCategory,
              eq(
                kalakritiAgeCategory.id,
                kalakritiCompetitionDivision.ageCategoryId
              )
            )
            .leftJoin(
              kalakritiCompetitionSession,
              eq(
                kalakritiCompetitionSession.divisionId,
                kalakritiCompetitionDivision.id
              )
            )
            .leftJoin(
              kalakritiResult,
              eq(kalakritiResult.divisionId, kalakritiCompetitionDivision.id)
            )
            .leftJoin(winner, eq(winner.id, kalakritiResult.winnerEntryId))
            .leftJoin(runner, eq(runner.id, kalakritiResult.runnerUpEntryId))
            .where(
              and(
                eq(kalakritiCompetitionDivision.editionId, editionId),
                isNull(kalakritiCompetition.cancelledAt),
                isNull(kalakritiCompetition.retiredAt),
                isNull(kalakritiCompetitionCategory.retiredAt),
                isNull(kalakritiCompetitionSession.cancelledAt)
              )
            );
          const awards = events.flatMap((event) =>
            event.status === "published" &&
            event.winnerCenterId &&
            event.runnerUpCenterId
              ? [
                  {
                    winnerCenterId: event.winnerCenterId,
                    runnerUpCenterId: event.runnerUpCenterId,
                  },
                ]
              : []
          );
          const points = {
            winnerPoints: state?.winnerPoints ?? edition.winnerPoints,
            runnerUpPoints: state?.runnerUpPoints ?? edition.runnerUpPoints,
          };
          return {
            editionId,
            version: state?.version ?? 0,
            canFinalize: canManageKalakritiResults(access),
            canWrite: edition.lifecycle === "live",
            finalizedAt: state?.finalizedAt?.getTime() ?? null,
            winnerCenterId: state?.winnerCenterId ?? null,
            runnerUpCenterId: state?.runnerUpCenterId ?? null,
            ...points,
            publishedCount: awards.length,
            totalCount: events.length,
            centers: rankKalakritiCenters(centers, awards, points),
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" }
      );
    } catch (error) {
      log.error(error instanceof Error ? error : String(error));
      throw error;
    } finally {
      log.emit();
    }
  });

export const getKalakritiResultDetail = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(yearSchema.extend({ divisionId: z.uuid() }))
  .handler(async ({ context, data }): Promise<KalakritiResultDetail | null> => {
    if (!context.session) throw new Error("Unauthorized");
    const log = createRequestLogger();
    log.set({
      handler: "getKalakritiResultDetail",
      userId: context.session.user.id,
      year: data.year,
      divisionId: data.divisionId,
    });
    try {
      const access = await resolveKalakritiEditionAccess({
        userId: context.session.user.id,
        role: context.session.user.role ?? "unoriented_volunteer",
        year: data.year,
      });
      if (
        !access ||
        (access.edition.lifecycle === "archived" && !access.isGlobalAdmin)
      )
        throw new Error("Unauthorized");
      const editionId = access.edition.id;
      return await db.transaction(
        async (tx) => {
          const [event] = await tx
            .select({
              id: kalakritiCompetition.id,
              competitionCategoryId: kalakritiCompetition.competitionCategoryId,
              cancelledAt: kalakritiCompetition.cancelledAt,
              retiredAt: kalakritiCompetition.retiredAt,
              categoryRetiredAt: kalakritiCompetitionCategory.retiredAt,
            })
            .from(kalakritiCompetitionDivision)
            .innerJoin(
              kalakritiCompetition,
              eq(
                kalakritiCompetition.id,
                kalakritiCompetitionDivision.competitionId
              )
            )
            .innerJoin(
              kalakritiCompetitionCategory,
              eq(
                kalakritiCompetitionCategory.id,
                kalakritiCompetition.competitionCategoryId
              )
            )
            .innerJoin(
              kalakritiAgeCategory,
              eq(
                kalakritiAgeCategory.id,
                kalakritiCompetitionDivision.ageCategoryId
              )
            )
            .where(
              and(
                eq(kalakritiCompetitionDivision.id, data.divisionId),
                eq(kalakritiCompetitionDivision.editionId, editionId)
              )
            );
          if (!event || !canManageKalakritiResults(access, event)) return null;
          const [state] = await tx
            .select({ finalizedAt: kalakritiResultsState.finalizedAt })
            .from(kalakritiResultsState)
            .where(eq(kalakritiResultsState.editionId, editionId));
          const [result] = await tx
            .select()
            .from(kalakritiResult)
            .where(
              and(
                eq(kalakritiResult.editionId, editionId),
                eq(kalakritiResult.divisionId, data.divisionId)
              )
            );
          const [session] = await tx
            .select({
              id: kalakritiCompetitionSession.id,
              cancelledAt: kalakritiCompetitionSession.cancelledAt,
            })
            .from(kalakritiCompetitionSession)
            .where(
              and(
                eq(kalakritiCompetitionSession.editionId, editionId),
                eq(kalakritiCompetitionSession.divisionId, data.divisionId)
              )
            );
          const entries = await tx
            .select({
              id: kalakritiCompetitionEntry.id,
              centerName: kalakritiCenter.name,
            })
            .from(kalakritiCompetitionEntry)
            .innerJoin(
              kalakritiCenter,
              eq(kalakritiCenter.id, kalakritiCompetitionEntry.centerId)
            )
            .where(
              and(
                eq(kalakritiCompetitionEntry.editionId, editionId),
                eq(kalakritiCompetitionEntry.divisionId, data.divisionId)
              )
            );
          const members = await tx
            .select({
              entryId: kalakritiEntryMember.entryId,
              studentId: kalakritiStudent.id,
              name: kalakritiStudent.name,
              humanId: kalakritiStudent.humanId,
            })
            .from(kalakritiEntryMember)
            .innerJoin(
              kalakritiStudent,
              eq(kalakritiStudent.id, kalakritiEntryMember.studentId)
            )
            .where(
              and(
                eq(kalakritiEntryMember.editionId, editionId),
                eq(kalakritiEntryMember.divisionId, data.divisionId)
              )
            );
          const marks = session
            ? await tx
                .select({ studentId: kalakritiOperation.studentId })
                .from(kalakritiOperation)
                .where(
                  and(
                    eq(kalakritiOperation.editionId, editionId),
                    eq(kalakritiOperation.competitionSessionId, session.id),
                    eq(kalakritiOperation.type, "competition_attendance"),
                    isNull(kalakritiOperation.supersededByOperationId)
                  )
                )
            : [];
          const attended = new Set(marks.map((mark) => mark.studentId));
          const scorecards = result?.scorecardIds.length
            ? await tx
                .select({
                  id: kalakritiResultScorecard.id,
                  fileName: kalakritiResultScorecard.fileName,
                  mimeType: kalakritiResultScorecard.mimeType,
                  byteSize: kalakritiResultScorecard.byteSize,
                })
                .from(kalakritiResultScorecard)
                .where(
                  and(
                    eq(kalakritiResultScorecard.editionId, editionId),
                    eq(kalakritiResultScorecard.divisionId, data.divisionId),
                    inArray(kalakritiResultScorecard.id, result.scorecardIds)
                  )
                )
            : [];
          const revisions = result
            ? await tx
                .select({
                  version: kalakritiResultRevision.version,
                  status: kalakritiResultRevision.status,
                  winnerEntryId: kalakritiResultRevision.winnerEntryId,
                  runnerUpEntryId: kalakritiResultRevision.runnerUpEntryId,
                  createdAt: kalakritiResultRevision.createdAt,
                })
                .from(kalakritiResultRevision)
                .where(eq(kalakritiResultRevision.resultId, result.id))
                .orderBy(desc(kalakritiResultRevision.version))
            : [];
          return {
            editionId,
            divisionId: data.divisionId,
            canWrite:
              access.edition.lifecycle === "live" &&
              state?.finalizedAt == null &&
              event.cancelledAt === null &&
              event.retiredAt === null &&
              event.categoryRetiredAt === null &&
              session?.cancelledAt === null,
            version: result?.version ?? 0,
            resultId: result?.id ?? null,
            status: result?.status ?? "draft",
            winnerEntryId: result?.winnerEntryId ?? null,
            runnerUpEntryId: result?.runnerUpEntryId ?? null,
            scorecards,
            entries: entries.map((entry) => {
              const people = members.filter(
                (member) => member.entryId === entry.id
              );
              return {
                ...entry,
                label: people
                  .map((person) => `${person.name} (${person.humanId})`)
                  .join(", "),
                eligible:
                  people.length > 0 &&
                  people.every((person) => attended.has(person.studentId)),
              };
            }),
            revisions: revisions.map((revision) => ({
              ...revision,
              createdAt: revision.createdAt.getTime(),
            })),
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" }
      );
    } catch (error) {
      log.error(error instanceof Error ? error : String(error));
      throw error;
    } finally {
      log.emit();
    }
  });
