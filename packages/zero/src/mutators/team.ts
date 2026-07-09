import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import { requireEnqueue } from "../context";
import {
  assertHasPermission,
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
  can,
} from "../permissions";
import { zql } from "../schema";

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
        ctx.asyncTasks?.push({
          fn: async () => {
            const enqueue = requireEnqueue(ctx);
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
              const enqueue = requireEnqueue(ctx);
              await enqueue(
                "notify-added-to-team",
                {
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
      whatsappGroupId: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "teams.create");
      const now = Date.now();
      await tx.mutate.team.insert({
        createdAt: now,
        description: args.description,
        id: args.id,
        name: args.name,
        updatedAt: now,
        whatsappGroupId: args.whatsappGroupId,
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
            const enqueue = requireEnqueue(ctx);
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
            const enqueue = requireEnqueue(ctx);
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
        zql.teamMember.where("id", args.memberId).one()
      );
      if (!member) {
        throw new Error("Member not found");
      }

      if (!can(ctx, "teams.manage_members") && member.role === "lead") {
        throw new Error("Team leads cannot remove other leads");
      }

      const memberUserId = member.userId;
      const teamName = (await tx.run(zql.team.where("id", args.teamId).one()))
        ?.name;
      await tx.mutate.teamMember.delete({ id: args.memberId });

      if (tx.location === "server") {
        const { teamId } = args;
        ctx.asyncTasks?.push({
          fn: async () => {
            const enqueue = requireEnqueue(ctx);
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
              const enqueue = requireEnqueue(ctx);
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
        ctx.asyncTasks?.push({
          fn: async () => {
            const enqueue = requireEnqueue(ctx);
            await enqueue(
              "notify-team-role-changed",
              {
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
      whatsappGroupId: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "teams.edit");
      const existing = await tx.run(zql.team.where("id", args.id).one());
      if (!existing) {
        throw new Error("Team not found");
      }
      await tx.mutate.team.update({
        description: args.description,
        id: args.id,
        name: args.name,
        updatedAt: args.now,
        whatsappGroupId: args.whatsappGroupId,
      });

      if (tx.location === "server") {
        const teamId = args.id;
        const teamName = args.name;
        const updatedAt = args.now;
        const members = await tx.run(zql.teamMember.where("teamId", teamId));
        const memberIds = members.map((m) => m.userId);
        ctx.asyncTasks?.push({
          fn: async () => {
            const enqueue = requireEnqueue(ctx);
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
