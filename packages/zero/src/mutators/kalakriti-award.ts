import { canManageKalakritiAwards } from "@pi-dash/shared/kalakriti-awards";
import { defineMutator, type Transaction } from "@rocicorp/zero";
import { uuidv7 } from "uuidv7";
import z from "zod";

import type { Context } from "../context";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import { getEditionForUpdate } from "./kalakriti-row-locks";

const expectedVersionSchema = z.object({
  studentId: z.uuid(),
  version: z.number().int().nonnegative(),
});

export const kalakritiAwardSetSchema = z.object({
  editionId: z.uuid(),
  divisionId: z.uuid(),
  entryId: z.uuid(),
  award: z.enum(["winner", "runner_up"]),
  studentId: z.uuid().optional(),
  awarded: z.boolean(),
  expectedVersions: z.array(expectedVersionSchema).min(1).max(1000),
  commandId: z.uuid(),
  now: z.number().int().nonnegative().max(8_640_000_000_000_000),
});

type AwardSetArgs = z.infer<typeof kalakritiAwardSetSchema>;
type CommandPayload = Omit<AwardSetArgs, "editionId" | "commandId">;

function commandPayload(args: CommandPayload): CommandPayload {
  return {
    divisionId: args.divisionId,
    entryId: args.entryId,
    award: args.award,
    ...(args.studentId === undefined ? {} : { studentId: args.studentId }),
    awarded: args.awarded,
    expectedVersions: args.expectedVersions
      .map(({ studentId, version }) => ({ studentId, version }))
      .sort((a, b) => a.studentId.localeCompare(b.studentId)),
    now: args.now,
  };
}

function samePayload(left: CommandPayload, right: CommandPayload) {
  return (
    JSON.stringify(commandPayload(left)) ===
    JSON.stringify(commandPayload(right))
  );
}

async function authorize(
  tx: Transaction,
  ctx: Context | undefined,
  editionId: string
) {
  assertIsLoggedIn(ctx);
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
    !canManageKalakritiAwards({
      isGlobalAdmin: can(ctx, "kalakriti.admin"),
      membership: membership ? { kind: membership.kind, assignments } : null,
    })
  )
    throw new Error("Unauthorized");
}

export const kalakritiAwardMutators = {
  set: defineMutator(kalakritiAwardSetSchema, async ({ tx, ctx, args }) => {
    if (tx.location !== "server") return;
    const edition = await getEditionForUpdate(tx, args.editionId);
    if (edition?.lifecycle !== "live")
      throw new Error("Awards require a Live Edition");
    await authorize(tx, ctx, args.editionId);
    assertIsLoggedIn(ctx);

    const payload = commandPayload(args);
    const replay = await tx.run(
      zql.kalakritiAwardCommand.where("id", args.commandId).one()
    );
    if (replay) {
      if (
        replay.editionId !== args.editionId ||
        replay.actorUserId !== ctx.userId ||
        !samePayload(replay.payload as CommandPayload, payload)
      )
        throw new Error("Command ID is already used");
      return;
    }

    const result = await tx.run(
      zql.kalakritiResult
        .where("editionId", args.editionId)
        .where("divisionId", args.divisionId)
        .one()
    );
    const awardedEntryId =
      args.award === "winner" ? result?.winnerEntryId : result?.runnerUpEntryId;
    if (result?.status !== "published" || awardedEntryId !== args.entryId)
      throw new Error("Published award not found");

    const entry = await tx.run(
      zql.kalakritiCompetitionEntry
        .where("editionId", args.editionId)
        .where("divisionId", args.divisionId)
        .where("id", args.entryId)
        .one()
    );
    if (!entry) throw new Error("Award entry does not belong to this event");
    const members = await tx.run(
      zql.kalakritiEntryMember
        .where("editionId", args.editionId)
        .where("divisionId", args.divisionId)
        .where("entryId", args.entryId)
    );
    if (members.length === 0) throw new Error("Award entry has no members");

    const expected = new Map(
      args.expectedVersions.map((item) => [item.studentId, item.version])
    );
    if (expected.size !== args.expectedVersions.length)
      throw new Error("Expected versions contain duplicate students");
    const targetMembers = args.studentId
      ? members.filter((member) => member.studentId === args.studentId)
      : members;
    if (
      targetMembers.length === 0 ||
      expected.size !== targetMembers.length ||
      targetMembers.some((member) => !expected.has(member.studentId))
    )
      throw new Error("Expected versions must exactly match award recipients");

    const currentRows = await tx.run(
      zql.kalakritiAwardHandover
        .where("editionId", args.editionId)
        .where("divisionId", args.divisionId)
        .where("entryId", args.entryId)
        .where("award", args.award)
    );
    for (const member of targetMembers) {
      const current = currentRows.find(
        (row) => row.studentId === member.studentId
      );
      if ((current?.version ?? 0) !== expected.get(member.studentId))
        throw new Error("Awards changed. Reload before updating");
    }

    for (const member of targetMembers) {
      const current = currentRows.find(
        (row) => row.studentId === member.studentId
      );
      if (current?.awarded === args.awarded || (!current && !args.awarded))
        continue;
      if (current) {
        await tx.mutate.kalakritiAwardHandover.update({
          id: current.id,
          awarded: args.awarded,
          version: current.version + 1,
          updatedAt: args.now,
          updatedBy: ctx.userId,
        });
      } else {
        await tx.mutate.kalakritiAwardHandover.insert({
          id: uuidv7(),
          editionId: args.editionId,
          divisionId: args.divisionId,
          entryId: args.entryId,
          studentId: member.studentId,
          award: args.award,
          awarded: true,
          version: 1,
          updatedAt: args.now,
          updatedBy: ctx.userId,
        });
      }
    }
    await tx.mutate.kalakritiAwardCommand.insert({
      id: args.commandId,
      editionId: args.editionId,
      actorUserId: ctx.userId,
      payload,
      createdAt: args.now,
    });
  }),
};
