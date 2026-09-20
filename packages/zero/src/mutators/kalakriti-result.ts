import {
  ALLOWED_KALAKRITI_SCORECARD_TYPES,
  MAX_KALAKRITI_SCORECARD_FILES,
  MAX_KALAKRITI_SCORECARD_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import {
  assertKalakritiFinalOrder,
  canManageKalakritiResults,
  rankKalakritiCenters,
} from "@pi-dash/shared/kalakriti-results";
import { defineMutator, type Transaction } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import { getEditionForUpdate } from "./kalakriti-row-locks";
import {
  claimUploadedR2ObjectKey,
  createR2ClaimOptions,
} from "./submission-helpers";

const baseSchema = z.object({
  editionId: z.uuid(),
  revisionId: z.uuid(),
  expectedVersion: z.number().int().min(0),
  now: z.number().int().nonnegative(),
});
const divisionSchema = baseSchema.extend({ divisionId: z.uuid() });
export const kalakritiResultSaveSchema = divisionSchema.extend({
  resultId: z.uuid(),
  status: z.enum(["draft", "published"]),
  winnerEntryId: z.uuid().nullable(),
  runnerUpEntryId: z.uuid().nullable(),
  scorecardIds: z.array(z.uuid()).max(MAX_KALAKRITI_SCORECARD_FILES),
  uploads: z
    .array(
      z.object({
        id: z.uuid(),
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.enum(ALLOWED_KALAKRITI_SCORECARD_TYPES),
        byteSize: z
          .number()
          .int()
          .positive()
          .max(MAX_KALAKRITI_SCORECARD_SIZE_BYTES),
        objectKey: z.string().min(1).max(1024),
      })
    )
    .max(MAX_KALAKRITI_SCORECARD_FILES),
});

async function authorize(
  tx: Transaction,
  ctx: Context | undefined,
  editionId: string,
  divisionId?: string
) {
  assertIsLoggedIn(ctx);
  const division = divisionId
    ? await tx.run(
        zql.kalakritiCompetitionDivision
          .where("id", divisionId)
          .where("editionId", editionId)
          .one()
      )
    : undefined;
  if (divisionId && !division)
    throw new Error("Competition Division not found");
  const competition = division
    ? await tx.run(
        zql.kalakritiCompetition
          .where("id", division.competitionId)
          .where("editionId", editionId)
          .one()
      )
    : undefined;
  if (division && !competition) throw new Error("Competition not found");
  const membership = await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("userId", ctx.userId)
      .where("state", "active")
      .one()
  );
  const assignments = membership
    ? await tx.run(
        zql.kalakritiAssignment
          .where("editionId", editionId)
          .where("membershipId", membership.id)
      )
    : [];
  if (
    !canManageKalakritiResults(
      {
        isGlobalAdmin: can(ctx, "kalakriti.admin"),
        membership: membership ? { kind: membership.kind, assignments } : null,
      },
      competition
    )
  )
    throw new Error("Unauthorized");
  return competition;
}

async function lockResults(tx: Transaction, editionId: string) {
  const edition = await getEditionForUpdate(tx, editionId);
  if (edition?.lifecycle !== "live")
    throw new Error("Results require a Live Edition");
  const state = await tx.run(
    zql.kalakritiResultsState.where("editionId", editionId).one()
  );
  return state;
}

async function advanceState(
  tx: Transaction,
  editionId: string,
  state: Awaited<ReturnType<typeof lockResults>>,
  publish: boolean
) {
  const edition = await tx.run(
    zql.kalakritiEdition.where("id", editionId).one()
  );
  if (!edition) throw new Error("Edition not found");
  const snapshot = {
    id: state?.id ?? editionId,
    editionId,
    version: (state?.version ?? 0) + 1,
    winnerPoints:
      state?.winnerPoints ?? (publish ? edition.winnerPoints : null),
    runnerUpPoints:
      state?.runnerUpPoints ?? (publish ? edition.runnerUpPoints : null),
    finalizedAt: null,
    winnerCenterId: null,
    runnerUpCenterId: null,
    tieReason: null,
  };
  if (state) await tx.mutate.kalakritiResultsState.update(snapshot);
  else await tx.mutate.kalakritiResultsState.insert(snapshot);
  return snapshot;
}

async function assertEligibleAward(
  tx: Transaction,
  editionId: string,
  divisionId: string,
  entryId: string,
  requireAttendance: boolean
) {
  const entry = await tx.run(
    zql.kalakritiCompetitionEntry
      .where("id", entryId)
      .where("editionId", editionId)
      .where("divisionId", divisionId)
      .one()
  );
  if (!entry) throw new Error("Award entry does not belong to this event");
  if (!requireAttendance) return;
  const session = await tx.run(
    zql.kalakritiCompetitionSession
      .where("editionId", editionId)
      .where("divisionId", divisionId)
      .where("cancelledAt", "IS", null)
      .one()
  );
  if (!session) throw new Error("An active session is required");
  const members = await tx.run(
    zql.kalakritiEntryMember
      .where("editionId", editionId)
      .where("entryId", entryId)
  );
  const attendance = await tx.run(
    zql.kalakritiOperation
      .where("editionId", editionId)
      .where("competitionSessionId", session.id)
      .where("type", "competition_attendance")
      .where("supersededByOperationId", "IS", null)
  );
  const attended = new Set(attendance.map((mark) => mark.studentId));
  if (!members.some((member) => attended.has(member.studentId)))
    throw new Error(
      "At least one member of an awarded entry must have recorded competition attendance"
    );
}

async function assertAwardHandoversUndone(
  tx: Transaction,
  editionId: string,
  divisionId: string,
  entryId: string | null,
  award: "winner" | "runner_up"
) {
  if (!entryId) return;
  const awarded = await tx.run(
    zql.kalakritiAwardHandover
      .where("editionId", editionId)
      .where("divisionId", divisionId)
      .where("entryId", entryId)
      .where("award", award)
      .where("awarded", true)
      .one()
  );
  if (awarded)
    throw new Error("Undo awarded prizes before changing published results");
}

async function assertActiveDivision(
  tx: Transaction,
  editionId: string,
  divisionId: string,
  competition: Awaited<ReturnType<typeof authorize>>
) {
  if (
    !competition ||
    competition.cancelledAt !== null ||
    competition.retiredAt !== null
  )
    throw new Error("Competition is inactive or cancelled");
  const category = await tx.run(
    zql.kalakritiCompetitionCategory
      .where("editionId", editionId)
      .where("id", competition.competitionCategoryId)
      .one()
  );
  const division = await tx.run(
    zql.kalakritiCompetitionDivision
      .where("editionId", editionId)
      .where("id", divisionId)
      .one()
  );
  const age =
    division &&
    (await tx.run(
      zql.kalakritiAgeCategory.where("id", division.ageCategoryId).one()
    ));
  const session = await tx.run(
    zql.kalakritiCompetitionSession
      .where("editionId", editionId)
      .where("divisionId", divisionId)
      .one()
  );
  if (
    !category ||
    category.retiredAt !== null ||
    !age ||
    !session ||
    session.cancelledAt !== null
  )
    throw new Error("Event is inactive or cancelled");
}

export const kalakritiResultMutators = {
  save: defineMutator(kalakritiResultSaveSchema, async ({ tx, ctx, args }) => {
    if (tx.location !== "server") return;
    const state = await lockResults(tx, args.editionId);
    const competition = await authorize(
      tx,
      ctx,
      args.editionId,
      args.divisionId
    );
    assertIsLoggedIn(ctx);
    const replay = await tx.run(
      zql.kalakritiResultRevision.where("id", args.revisionId).one()
    );
    if (replay) {
      if (
        replay.editionId !== args.editionId ||
        replay.resultId !== args.resultId ||
        replay.createdBy !== ctx.userId
      )
        throw new Error("Revision ID is already used");
      return;
    }
    if (state?.finalizedAt != null)
      throw new Error("Reopen overall results before editing");
    await assertActiveDivision(
      tx,
      args.editionId,
      args.divisionId,
      competition
    );
    const current = await tx.run(
      zql.kalakritiResult
        .where("editionId", args.editionId)
        .where("divisionId", args.divisionId)
        .one()
    );
    if (
      (current?.version ?? 0) !== args.expectedVersion ||
      (current && current.id !== args.resultId)
    )
      throw new Error("Results changed. Reload before saving");
    if (current?.status === "published" && args.status === "draft")
      throw new Error("Withdraw published results before saving a draft");
    if (
      current?.status === "published" &&
      current.winnerEntryId !== args.winnerEntryId
    )
      await assertAwardHandoversUndone(
        tx,
        args.editionId,
        args.divisionId,
        current.winnerEntryId,
        "winner"
      );
    if (
      current?.status === "published" &&
      current.runnerUpEntryId !== args.runnerUpEntryId
    )
      await assertAwardHandoversUndone(
        tx,
        args.editionId,
        args.divisionId,
        current.runnerUpEntryId,
        "runner_up"
      );
    if (args.winnerEntryId && args.winnerEntryId === args.runnerUpEntryId)
      throw new Error("Winner and runner-up must be different entries");
    const publishing = args.status === "published";
    if (publishing && (!args.winnerEntryId || !args.runnerUpEntryId))
      throw new Error("Both winner and runner-up are required");
    if (args.winnerEntryId)
      await assertEligibleAward(
        tx,
        args.editionId,
        args.divisionId,
        args.winnerEntryId,
        publishing
      );
    if (args.runnerUpEntryId)
      await assertEligibleAward(
        tx,
        args.editionId,
        args.divisionId,
        args.runnerUpEntryId,
        publishing
      );
    const ids = [...args.scorecardIds, ...args.uploads.map((file) => file.id)];
    if (
      new Set(ids).size !== ids.length ||
      ids.length > MAX_KALAKRITI_SCORECARD_FILES ||
      (publishing && ids.length === 0)
    )
      throw new Error(
        "Publishing requires between one and ten distinct scorecards"
      );
    const existingFiles = await tx.run(
      zql.kalakritiResultScorecard
        .where("editionId", args.editionId)
        .where("divisionId", args.divisionId)
    );
    if (
      args.scorecardIds.some(
        (id) => !existingFiles.some((file) => file.id === id)
      )
    )
      throw new Error("Scorecard does not belong to this event");
    for (const file of args.uploads) {
      const objectKey = claimUploadedR2ObjectKey(
        file.objectKey,
        createR2ClaimOptions(ctx, tx.location, {
          subfolder: "kalakriti-scorecards",
          durablePrefix: `${args.editionId}/${args.divisionId}`,
          mimeType: file.mimeType,
          byteSize: file.byteSize,
        })
      );
      // biome-ignore lint/performance/noAwaitInLoops: claims and metadata belong to this transaction
      await tx.mutate.kalakritiResultScorecard.insert({
        ...file,
        objectKey,
        editionId: args.editionId,
        divisionId: args.divisionId,
        uploadedAt: args.now,
        uploadedBy: ctx.userId,
      });
    }
    const snapshot = {
      editionId: args.editionId,
      version: args.expectedVersion + 1,
      status: args.status,
      winnerEntryId: args.winnerEntryId,
      runnerUpEntryId: args.runnerUpEntryId,
      scorecardIds: ids,
    };
    const row = {
      ...snapshot,
      id: args.resultId,
      divisionId: args.divisionId,
      updatedAt: args.now,
      updatedBy: ctx.userId,
    };
    if (current) await tx.mutate.kalakritiResult.update(row);
    else await tx.mutate.kalakritiResult.insert(row);
    await tx.mutate.kalakritiResultRevision.insert({
      ...snapshot,
      id: args.revisionId,
      resultId: args.resultId,
      createdAt: args.now,
      createdBy: ctx.userId,
    });
    await advanceState(tx, args.editionId, state, publishing);
  }),
  withdraw: defineMutator(divisionSchema, async ({ tx, ctx, args }) => {
    if (tx.location !== "server") return;
    const state = await lockResults(tx, args.editionId);
    await authorize(tx, ctx, args.editionId, args.divisionId);
    assertIsLoggedIn(ctx);
    const current = await tx.run(
      zql.kalakritiResult
        .where("editionId", args.editionId)
        .where("divisionId", args.divisionId)
        .one()
    );
    if (!current) throw new Error("Results not found");
    const replay = await tx.run(
      zql.kalakritiResultRevision.where("id", args.revisionId).one()
    );
    if (replay) {
      if (replay.resultId !== current.id || replay.createdBy !== ctx.userId)
        throw new Error("Revision ID is already used");
      return;
    }
    if (state?.finalizedAt != null)
      throw new Error("Reopen overall results before withdrawing");
    if (
      current.version !== args.expectedVersion ||
      current.status !== "published"
    )
      throw new Error("Results changed. Reload before withdrawing");
    await assertAwardHandoversUndone(
      tx,
      args.editionId,
      args.divisionId,
      current.winnerEntryId,
      "winner"
    );
    await assertAwardHandoversUndone(
      tx,
      args.editionId,
      args.divisionId,
      current.runnerUpEntryId,
      "runner_up"
    );
    const snapshot = {
      editionId: args.editionId,
      version: current.version + 1,
      status: "draft" as const,
      winnerEntryId: current.winnerEntryId,
      runnerUpEntryId: current.runnerUpEntryId,
      scorecardIds: current.scorecardIds,
    };
    await tx.mutate.kalakritiResult.update({
      ...snapshot,
      id: current.id,
      updatedAt: args.now,
      updatedBy: ctx.userId,
    });
    await tx.mutate.kalakritiResultRevision.insert({
      ...snapshot,
      id: args.revisionId,
      resultId: current.id,
      createdAt: args.now,
      createdBy: ctx.userId,
    });
    await advanceState(tx, args.editionId, state, false);
  }),
  finalize: defineMutator(
    baseSchema.extend({
      winnerCenterId: z.uuid(),
      runnerUpCenterId: z.uuid(),
      tieReason: z.string().trim().max(1000).nullable(),
    }),
    async ({ tx, ctx, args }) => {
      if (tx.location !== "server") return;
      const state = await lockResults(tx, args.editionId);
      await authorize(tx, ctx, args.editionId);
      assertIsLoggedIn(ctx);
      const replay = await tx.run(
        zql.kalakritiStandingsRevision.where("id", args.revisionId).one()
      );
      if (replay) {
        if (
          replay.editionId !== args.editionId ||
          replay.createdBy !== ctx.userId ||
          replay.action !== "finalized"
        )
          throw new Error("Revision ID is already used");
        return;
      }
      if (
        !state ||
        state.version !== args.expectedVersion ||
        state.finalizedAt !== null
      )
        throw new Error("Standings changed. Reload before finalizing");
      const [
        divisions,
        competitions,
        categories,
        ages,
        sessions,
        results,
        centers,
        entries,
      ] = await Promise.all([
        tx.run(
          zql.kalakritiCompetitionDivision.where("editionId", args.editionId)
        ),
        tx.run(zql.kalakritiCompetition.where("editionId", args.editionId)),
        tx.run(
          zql.kalakritiCompetitionCategory.where("editionId", args.editionId)
        ),
        tx.run(zql.kalakritiAgeCategory.where("editionId", args.editionId)),
        tx.run(
          zql.kalakritiCompetitionSession.where("editionId", args.editionId)
        ),
        tx.run(
          zql.kalakritiResult
            .where("editionId", args.editionId)
            .where("status", "published")
        ),
        tx.run(
          zql.kalakritiCenter
            .where("editionId", args.editionId)
            .where("retiredAt", "IS", null)
        ),
        tx.run(
          zql.kalakritiCompetitionEntry.where("editionId", args.editionId)
        ),
      ]);
      const active = divisions.filter((division) => {
        const competition = competitions.find(
          (row) => row.id === division.competitionId
        );
        const session = sessions.find((row) => row.divisionId === division.id);
        return (
          competition &&
          competition.cancelledAt === null &&
          competition.retiredAt === null &&
          categories.some(
            (row) =>
              row.id === competition.competitionCategoryId &&
              row.retiredAt === null
          ) &&
          ages.some((row) => row.id === division.ageCategoryId) &&
          (!session || session.cancelledAt === null)
        );
      });
      if (
        !active.length ||
        active.some(
          (division) =>
            !results.some((result) => result.divisionId === division.id)
        )
      )
        throw new Error(
          "Publish both awards for every active event before finalizing"
        );
      const awards = [];
      for (const result of results.filter((row) =>
        active.some((division) => division.id === row.divisionId)
      )) {
        if (
          !result.winnerEntryId ||
          !result.runnerUpEntryId ||
          result.scorecardIds.length === 0
        )
          throw new Error("Published results are incomplete");
        // biome-ignore lint/performance/noAwaitInLoops: finalization revalidates each award under the Edition lock
        await assertEligibleAward(
          tx,
          args.editionId,
          result.divisionId,
          result.winnerEntryId,
          true
        );
        // biome-ignore lint/performance/noAwaitInLoops: finalization revalidates each award under the Edition lock
        await assertEligibleAward(
          tx,
          args.editionId,
          result.divisionId,
          result.runnerUpEntryId,
          true
        );
        const winner = entries.find(
          (entry) => entry.id === result.winnerEntryId
        );
        const runner = entries.find(
          (entry) => entry.id === result.runnerUpEntryId
        );
        if (!winner || !runner) throw new Error("Award entries are missing");
        awards.push({
          winnerCenterId: winner.centerId,
          runnerUpCenterId: runner.centerId,
        });
      }
      if (state.winnerPoints === null || state.runnerUpPoints === null)
        throw new Error("Scoring rules have not been fixed");
      const points = {
        winnerPoints: state.winnerPoints,
        runnerUpPoints: state.runnerUpPoints,
      };
      assertKalakritiFinalOrder(
        rankKalakritiCenters(centers, awards, points),
        args.winnerCenterId,
        args.runnerUpCenterId,
        args.tieReason
      );
      await tx.mutate.kalakritiResultsState.update({
        id: state.id,
        version: state.version + 1,
        finalizedAt: args.now,
        winnerCenterId: args.winnerCenterId,
        runnerUpCenterId: args.runnerUpCenterId,
        tieReason: args.tieReason,
      });
      await tx.mutate.kalakritiStandingsRevision.insert({
        id: args.revisionId,
        editionId: args.editionId,
        version: state.version + 1,
        action: "finalized",
        ...points,
        winnerCenterId: args.winnerCenterId,
        runnerUpCenterId: args.runnerUpCenterId,
        tieReason: args.tieReason,
        createdAt: args.now,
        createdBy: ctx.userId,
      });
    }
  ),
  reopen: defineMutator(baseSchema, async ({ tx, ctx, args }) => {
    if (tx.location !== "server") return;
    const state = await lockResults(tx, args.editionId);
    await authorize(tx, ctx, args.editionId);
    assertIsLoggedIn(ctx);
    const replay = await tx.run(
      zql.kalakritiStandingsRevision.where("id", args.revisionId).one()
    );
    if (replay) {
      if (
        replay.editionId !== args.editionId ||
        replay.createdBy !== ctx.userId ||
        replay.action !== "reopened"
      )
        throw new Error("Revision ID is already used");
      return;
    }
    if (
      !state ||
      state.version !== args.expectedVersion ||
      state.finalizedAt === null ||
      state.winnerPoints === null ||
      state.runnerUpPoints === null
    )
      throw new Error("Standings changed. Reload before reopening");
    await tx.mutate.kalakritiStandingsRevision.insert({
      id: args.revisionId,
      editionId: args.editionId,
      version: state.version + 1,
      action: "reopened",
      winnerPoints: state.winnerPoints,
      runnerUpPoints: state.runnerUpPoints,
      winnerCenterId: state.winnerCenterId,
      runnerUpCenterId: state.runnerUpCenterId,
      tieReason: state.tieReason,
      createdAt: args.now,
      createdBy: ctx.userId,
    });
    await advanceState(tx, args.editionId, state, false);
  }),
};
