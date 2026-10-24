import { defineMutator, type Transaction } from "@rocicorp/zero";
import z from "zod";

import "../context";
import {
  assertHasPermission,
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
  can,
} from "../permissions";
import { type Schema, zql } from "../schema";
import {
  assertWhatsAppGroupAvailable,
  pushAddGroupMembersTask,
  whatsappGroupChange,
} from "./whatsapp-group-link";

/** A team may only point at an active programme. */
async function assertProgrammeSelectable(
  tx: Transaction<Schema>,
  programmeId: string | undefined
) {
  if (!programmeId) {
    return;
  }
  const programme = await tx.run(zql.programme.where("id", programmeId).one());
  if (!programme || programme.active === false) {
    throw new Error("Choose an active programme");
  }
}

export const teamMutators = {
  addMember: defineMutator(
    z.object({
      id: z.string(),
      role: z.enum(["member", "lead"]).default("member"),
      teamId: z.string(),
      userId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", args.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "teams.manage_members", isTeamLead);

      const existing = await tx.run(
        zql.teamMember
          .where("teamId", args.teamId)
          .where("userId", args.userId)
          .one()
      );
      if (existing) {
        throw new Error("User is already a member");
      }

      await tx.mutate.teamMember.insert({
        id: args.id,
        joinedAt: Date.now(),
        role: args.role,
        teamId: args.teamId,
        userId: args.userId,
      });

      if (tx.location === "server") {
        const { teamId } = args;
        const { userId } = args;
        const memberId = args.id;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "whatsapp-add-member-team",
              { teamId, userId },
              { traceId: ctx.traceId }
            );
          },
          meta: { mutator: "addTeamMember", teamId, userId },
        });

        const teamName = (await tx.run(zql.team.where("id", args.teamId).one()))
          ?.name;
        if (teamName) {
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-added-to-team",
                {
                  memberId,
                  teamId,
                  teamName,
                  userId,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: { mutator: "addTeamMember", teamId, teamName, userId },
          });
        }
      }
    }
  ),
  create: defineMutator(
    z.object({
      createWhatsAppGroup: z.boolean().optional(),
      description: z.string().optional(),
      id: z.string(),
      name: z.string().min(1),
      programmeId: z.string().optional(),
      whatsappGroupId: z.string().optional(),
      worksWithChildren: z.boolean().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "teams.create");
      await assertProgrammeSelectable(tx, args.programmeId);
      if (args.whatsappGroupId) {
        await assertWhatsAppGroupAvailable(tx, args.whatsappGroupId, {
          id: args.id,
          type: "team",
        });
      }
      const now = Date.now();
      await tx.mutate.team.insert({
        createdAt: now,
        description: args.description,
        id: args.id,
        name: args.name,
        programmeId: args.programmeId ?? null,
        updatedAt: now,
        whatsappGroupId: args.whatsappGroupId,
        worksWithChildren: args.worksWithChildren ?? false,
      });

      if (
        tx.location === "server" &&
        args.createWhatsAppGroup &&
        !args.whatsappGroupId
      ) {
        const teamId = args.id;
        const teamName = args.name;
        const creatorUserId = ctx.userId;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "whatsapp-create-group",
              {
                creatorUserId,
                entityId: teamId,
                entityType: "team",
                groupName: teamName,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: { mutator: "createTeam", teamId, teamName },
        });
      }
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "teams.delete");
      const existing = await tx.run(
        zql.team.where("id", args.id).related("members").one()
      );
      if (!existing) {
        throw new Error("Team not found");
      }

      // Deleting the team deletes its events, and an expense charged to an
      // event must keep it. Finance moves those expenses first.
      const [chargedReimbursement, chargedVendorPayment] = await Promise.all([
        tx.run(
          zql.reimbursement
            .where("chargedTo", "event")
            .whereExists("event", (e) => e.where("teamId", args.id))
            .one()
        ),
        tx.run(
          zql.vendorPayment
            .where("chargedTo", "event")
            .whereExists("event", (e) => e.where("teamId", args.id))
            .one()
        ),
      ]);
      if (chargedReimbursement || chargedVendorPayment) {
        throw new Error(
          "Expenses are charged to this team's events. Change what they are charged to before deleting the team."
        );
      }
      // The books keep an event's expenses for good (finance layer 3-3a:
      // ledger_entry.event_id is restrict), even after the request itself
      // is gone, so an event the books name can't be deleted. Server only:
      // the books sync to finance readers alone.
      if (tx.location === "server") {
        const events = await tx.run(zql.teamEvent.where("teamId", args.id));
        const eventIds = events.map((e) => e.id);
        const booked =
          eventIds.length > 0
            ? await tx.run(
                zql.ledgerEntry.where("eventId", "IN", eventIds).one()
              )
            : undefined;
        if (booked) {
          throw new Error(
            "The books hold expenses for this team's events, so the team can't be deleted."
          );
        }
      }

      const memberUserIds = existing.members.map((m) => m.userId);
      const teamName = existing.name;

      await Promise.all(
        existing.members.map(async (member) => {
          await tx.mutate.teamMember.delete({ id: member.id });
        })
      );
      await tx.mutate.team.delete({ id: args.id });

      if (tx.location === "server") {
        const deletedAt = Date.now();
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-team-deleted",
              {
                deletedAt,
                memberIds: memberUserIds,
                teamName: teamName ?? "Team",
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            memberCount: memberUserIds.length,
            mutator: "deleteTeam",
            teamName,
          },
        });
      }
    }
  ),

  removeMember: defineMutator(
    z.object({
      memberId: z.string(),
      teamId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", args.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "teams.manage_members", isTeamLead);

      const member = await tx.run(
        zql.teamMember
          .where("id", args.memberId)
          .where("teamId", args.teamId)
          .one()
      );
      if (!member) {
        throw new Error("Member not found");
      }

      if (!can(ctx, "teams.manage_members") && member.role === "lead") {
        throw new Error("Team leads cannot remove other leads");
      }

      const memberId = member.id;
      const memberUserId = member.userId;
      const teamId = member.teamId;
      const teamName = (await tx.run(zql.team.where("id", teamId).one()))?.name;
      await tx.mutate.teamMember.delete({ id: memberId });

      if (tx.location === "server") {
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "whatsapp-remove-member-team",
              {
                teamId,
                userId: memberUserId,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: { memberUserId, mutator: "removeTeamMember", teamId },
        });

        if (teamName) {
          const removedAt = Date.now();
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-removed-from-team",
                {
                  removedAt,
                  teamName,
                  userId: memberUserId,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: { memberUserId, mutator: "removeTeamMember", teamName },
          });
        }
      }
    }
  ),

  setMemberRole: defineMutator(
    z.object({
      memberId: z.string(),
      role: z.enum(["member", "lead"]),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const member = await tx.run(
        zql.teamMember.where("id", args.memberId).one()
      );
      if (!member) {
        throw new Error("Member not found");
      }
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", member.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "teams.manage_members", isTeamLead);
      await tx.mutate.teamMember.update({
        id: args.memberId,
        role: args.role,
      });

      if (tx.location === "server") {
        const { memberId } = args;
        const newRole = args.role;
        const targetUserId = member.userId as string;
        const teamId = member.teamId as string;
        const team = await tx.run(zql.team.where("id", teamId).one());
        const teamName = team?.name;
        const changedAt = Date.now();
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-team-role-changed",
              {
                changedAt,
                newRole: newRole ?? "member",
                teamId,
                teamName: teamName ?? "Team",
                userId: targetUserId,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: { memberId, mutator: "setMemberRole", newRole },
        });
      }
    }
  ),

  update: defineMutator(
    z.object({
      description: z.string().optional(),
      id: z.string(),
      name: z.string().min(1),
      now: z.number(),
      programmeId: z.string().nullable().optional(),
      // Undefined leaves the group alone; null removes it.
      whatsappGroupId: z.string().nullable().optional(),
      worksWithChildren: z.boolean().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "teams.edit");
      const existing = await tx.run(zql.team.where("id", args.id).one());
      if (!existing) {
        throw new Error("Team not found");
      }
      if (
        args.programmeId !== undefined &&
        args.programmeId !== existing.programmeId
      ) {
        await assertProgrammeSelectable(tx, args.programmeId ?? undefined);
      }
      const nextGroupId = whatsappGroupChange(
        existing.whatsappGroupId,
        args.whatsappGroupId
      );
      if (nextGroupId) {
        await assertWhatsAppGroupAvailable(tx, nextGroupId, {
          id: args.id,
          type: "team",
        });
      }
      await tx.mutate.team.update({
        description: args.description,
        id: args.id,
        name: args.name,
        programmeId:
          args.programmeId === undefined
            ? existing.programmeId
            : args.programmeId,
        updatedAt: args.now,
        ...(nextGroupId !== undefined && { whatsappGroupId: nextGroupId }),
        worksWithChildren:
          args.worksWithChildren ?? existing.worksWithChildren ?? false,
      });

      if (tx.location === "server") {
        const teamId = args.id;
        const teamName = args.name;
        const updatedAt = args.now;
        const members = await tx.run(zql.teamMember.where("teamId", teamId));
        const memberIds = members.map((m) => m.userId);
        // A new or switched group gets the current members; the old group
        // keeps its members, and removing the group removes no one.
        if (nextGroupId) {
          pushAddGroupMembersTask(ctx, {
            entityId: teamId,
            entityType: "team",
            groupId: nextGroupId,
            mutator: "updateTeam",
            userIds: memberIds,
          });
        }
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-team-updated",
              {
                memberIds,
                teamId,
                teamName,
                updatedAt,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: { mutator: "updateTeam", teamId, teamName },
        });
      }
    }
  ),
};
