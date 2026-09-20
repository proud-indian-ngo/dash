import { db } from "@pi-dash/db";
import {
  kalakritiAgeCategory,
  kalakritiCenter,
  kalakritiCompetition,
  kalakritiCompetitionDivision,
  kalakritiCompetitionEntry,
  kalakritiEdition,
  kalakritiEntryMember,
  kalakritiStudent,
} from "@pi-dash/db/schema/kalakriti";
import { kalakritiAwardHandover } from "@pi-dash/db/schema/kalakriti-awards";
import {
  kalakritiResult,
  kalakritiResultRevision,
} from "@pi-dash/db/schema/kalakriti-results";
import {
  canManageKalakritiAwards,
  type KalakritiAwardEntry,
  type KalakritiAwardsRoster,
} from "@pi-dash/shared/kalakriti-awards";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import z from "zod";

import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";
import { authMiddleware } from "@/middleware/auth";

export const getKalakritiAwards = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.strictObject({ year: z.number().int().min(2000).max(2200) }))
  .handler(async ({ context, data }): Promise<KalakritiAwardsRoster> => {
    if (!context.session) throw new Error("Unauthorized");
    const log = createRequestLogger();
    log.set({
      handler: "getKalakritiAwards",
      userId: context.session.user.id,
      year: data.year,
    });
    try {
      const access = await resolveKalakritiEditionAccess({
        userId: context.session.user.id,
        role: context.session.user.role ?? "unoriented_volunteer",
        year: data.year,
      });
      if (!access || !canManageKalakritiAwards(access))
        throw new Error("Unauthorized");
      const editionId = access.edition.id;
      return await db.transaction(
        async (tx) => {
          const [edition] = await tx
            .select({ lifecycle: kalakritiEdition.lifecycle })
            .from(kalakritiEdition)
            .where(eq(kalakritiEdition.id, editionId));
          if (
            !edition ||
            (edition.lifecycle === "archived" && !access.isGlobalAdmin)
          )
            throw new Error("Unauthorized");

          const rows = await tx
            .select({
              divisionId: kalakritiResult.divisionId,
              winnerEntryId: kalakritiResult.winnerEntryId,
              entryId: kalakritiCompetitionEntry.id,
              type: kalakritiCompetitionEntry.participationMode,
              competitionName: kalakritiCompetition.name,
              ageCategoryName: kalakritiAgeCategory.name,
              centerId: kalakritiCenter.id,
              centerName: kalakritiCenter.name,
              studentId: kalakritiStudent.id,
              name: kalakritiStudent.name,
              humanId: kalakritiStudent.humanId,
              gender: kalakritiStudent.gender,
              awarded: kalakritiAwardHandover.awarded,
              version: kalakritiAwardHandover.version,
            })
            .from(kalakritiResult)
            .innerJoin(
              kalakritiCompetitionEntry,
              and(
                eq(kalakritiCompetitionEntry.editionId, editionId),
                eq(
                  kalakritiCompetitionEntry.divisionId,
                  kalakritiResult.divisionId
                ),
                or(
                  eq(
                    kalakritiCompetitionEntry.id,
                    kalakritiResult.winnerEntryId
                  ),
                  eq(
                    kalakritiCompetitionEntry.id,
                    kalakritiResult.runnerUpEntryId
                  )
                )
              )
            )
            .innerJoin(
              kalakritiCompetitionDivision,
              eq(kalakritiCompetitionDivision.id, kalakritiResult.divisionId)
            )
            .innerJoin(
              kalakritiCompetition,
              eq(
                kalakritiCompetition.id,
                kalakritiCompetitionDivision.competitionId
              )
            )
            .innerJoin(
              kalakritiAgeCategory,
              eq(
                kalakritiAgeCategory.id,
                kalakritiCompetitionDivision.ageCategoryId
              )
            )
            .innerJoin(
              kalakritiCenter,
              eq(kalakritiCenter.id, kalakritiCompetitionEntry.centerId)
            )
            .innerJoin(
              kalakritiEntryMember,
              and(
                eq(kalakritiEntryMember.editionId, editionId),
                eq(kalakritiEntryMember.entryId, kalakritiCompetitionEntry.id)
              )
            )
            .innerJoin(
              kalakritiStudent,
              and(
                eq(kalakritiStudent.editionId, editionId),
                eq(kalakritiStudent.id, kalakritiEntryMember.studentId)
              )
            )
            .leftJoin(
              kalakritiAwardHandover,
              and(
                eq(kalakritiAwardHandover.editionId, editionId),
                eq(
                  kalakritiAwardHandover.divisionId,
                  kalakritiResult.divisionId
                ),
                eq(
                  kalakritiAwardHandover.entryId,
                  kalakritiCompetitionEntry.id
                ),
                eq(kalakritiAwardHandover.studentId, kalakritiStudent.id),
                or(
                  and(
                    eq(
                      kalakritiCompetitionEntry.id,
                      kalakritiResult.winnerEntryId
                    ),
                    eq(kalakritiAwardHandover.award, "winner")
                  ),
                  and(
                    eq(
                      kalakritiCompetitionEntry.id,
                      kalakritiResult.runnerUpEntryId
                    ),
                    eq(kalakritiAwardHandover.award, "runner_up")
                  )
                )
              )
            )
            .where(
              and(
                eq(kalakritiResult.editionId, editionId),
                eq(kalakritiResult.status, "published")
              )
            )
            .orderBy(
              asc(sql`(
                select min(${kalakritiResultRevision.createdAt})
                from ${kalakritiResultRevision}
                where ${kalakritiResultRevision.resultId} = ${kalakritiResult.id}
                  and ${kalakritiResultRevision.editionId} = ${kalakritiResult.editionId}
                  and ${kalakritiResultRevision.status} = 'published'
              )`),
              asc(kalakritiCompetition.name),
              asc(kalakritiAgeCategory.name),
              asc(kalakritiResult.divisionId),
              asc(kalakritiCompetitionEntry.id),
              asc(kalakritiStudent.name),
              asc(kalakritiStudent.id)
            );

          const entries = new Map<string, KalakritiAwardEntry>();
          for (const row of rows) {
            let entry = entries.get(row.entryId);
            if (!entry) {
              entry = {
                divisionId: row.divisionId,
                entryId: row.entryId,
                award:
                  row.entryId === row.winnerEntryId ? "winner" : "runner_up",
                competitionName: row.competitionName,
                ageCategoryName: row.ageCategoryName,
                centerId: row.centerId,
                centerName: row.centerName,
                type: row.type,
                members: [],
              };
              entries.set(row.entryId, entry);
            }
            entry.members.push({
              studentId: row.studentId,
              name: row.name,
              humanId: row.humanId,
              gender: row.gender,
              awarded: row.awarded ?? false,
              version: row.version ?? 0,
            });
          }
          log.set({
            editionId,
            entryCount: entries.size,
            recipientCount: rows.length,
          });
          return {
            editionId,
            canWrite: edition.lifecycle === "live",
            entries: [...entries.values()],
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
