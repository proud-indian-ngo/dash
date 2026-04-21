import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import {
  assertHasPermission,
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
  can,
} from "../permissions";
import { zql } from "../schema";

export const teamMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      name: z.string().min(1),
      description: z.string().optional(),
      whatsappGroupId: z.string().optional(),
      createWhatsAppGroup: z.boolean().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "teams.create");
      const now = Date.now();
      await tx.mutate.team.insert({
        id: args.id,
        name: args.name,
        description: args.description ?? null,
        whatsappGroupId: args.whatsappGroupId ?? null,
        createdAt: now,
        updatedAt: now,
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
          meta: { mutator: "createTeam", teamId, teamName },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "whatsapp-create-group",
              {
                entityType: "team",
                entityId: teamId,
                groupName: teamName,
                creatorUserId,
              },
              { traceId: ctx.traceId }
            );
          },
        });
      }
    }
  ),

  update: defineMutator(
    z.object({
      id: z.string(),
      name: z.string().min(1),
      description: z.string().optional(),
      whatsappGroupId: z.string().optional(),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "teams.edit");
      const existing = await tx.run(zql.team.where("id", args.id).one());
      if (!existing) {
        throw new Error("Team not found");
      }
      await tx.mutate.team.update({
        id: args.id,
        name: args.name,
        description: args.description ?? null,
        whatsappGroupId: args.whatsappGroupId ?? null,
        updatedAt: args.now,
      });

      if (tx.location === "server") {
        const teamId = args.id;
        const teamName = args.name;
        const updatedAt = args.now;
        const members = await tx.run(zql.teamMember.where("teamId", teamId));
        const memberIds = members.map((m) => m.userId);
        ctx.asyncTasks?.push({
          meta: { mutator: "updateTeam", teamId, teamName },
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

      for (const member of existing.members) {
        await tx.mutate.teamMember.delete({ id: member.id });
      }
      await tx.mutate.team.delete({ id: args.id });

      if (tx.location === "server") {
        const deletedAt = Date.now();
        ctx.asyncTasks?.push({
          meta: {
            mutator: "deleteTeam",
            teamName,
            memberCount: memberUserIds.length,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-team-deleted",
              {
                deletedAt,
                memberIds: memberUserIds,
                teamName,
              },
              { traceId: ctx.traceId }
            );
          },
        });
      }
    }
  ),

  addMember: defineMutator(
    z.object({
      id: z.string(),
      teamId: z.string(),
      userId: z.string(),
      role: z.enum(["member", "lead"]).default("member"),
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
        teamId: args.teamId,
        userId: args.userId,
        role: args.role,
        joinedAt: Date.now(),
      });

      if (tx.location === "server") {
        const teamId = args.teamId;
        const userId = args.userId;
        ctx.asyncTasks?.push({
          meta: { mutator: "addTeamMember", teamId, userId },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "whatsapp-add-member-team",
              { teamId, userId },
              { traceId: ctx.traceId }
            );
          },
        });

        const teamName = (await tx.run(zql.team.where("id", args.teamId).one()))
          ?.name;
        if (teamName) {
          ctx.asyncTasks?.push({
            meta: { mutator: "addTeamMember", teamId, teamName, userId },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-added-to-team",
                {
                  userId,
                  teamName,
                  teamId,
                },
                { traceId: ctx.traceId }
              );
            },
          });
        }
      }
    }
  ),

  removeMember: defineMutator(
    z.object({
      teamId: z.string(),
      memberId: z.string(),
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
        const teamId = args.teamId;
        ctx.asyncTasks?.push({
          meta: { mutator: "removeTeamMember", teamId, memberUserId },
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
        });

        if (teamName) {
          const removedAt = Date.now();
          ctx.asyncTasks?.push({
            meta: { mutator: "removeTeamMember", memberUserId, teamName },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-removed-from-team",
                {
                  removedAt,
                  userId: memberUserId,
                  teamName,
                },
                { traceId: ctx.traceId }
              );
            },
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
        const memberId = args.memberId;
        const newRole = args.role;
        const targetUserId = member.userId as string;
        const teamId = member.teamId as string;
        const team = await tx.run(zql.team.where("id", teamId).one());
        const teamName = team?.name ?? "Unknown";
        ctx.asyncTasks?.push({
          meta: { mutator: "setMemberRole", memberId, newRole },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-team-role-changed",
              {
                userId: targetUserId,
                teamId,
                teamName,
                newRole,
              },
              { traceId: ctx.traceId }
            );
          },
        });
      }
    }
  ),
};
