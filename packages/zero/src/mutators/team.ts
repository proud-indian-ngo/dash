import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsAdmin, assertIsLoggedIn } from "../permissions";
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
      assertIsAdmin(ctx);
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
        ctx.asyncTasks?.push(async () => {
          const { createWhatsAppGroup, getUserPhone } = await import(
            "@pi-dash/whatsapp"
          );
          const { db } = await import("@pi-dash/db");
          const { whatsappGroup } = await import(
            "@pi-dash/db/schema/whatsapp-group"
          );
          const { team } = await import("@pi-dash/db/schema/team");
          const { eq } = await import("drizzle-orm");

          const creatorPhone = await getUserPhone(creatorUserId);
          const participants = creatorPhone ? [creatorPhone] : [];
          const { jid } = await createWhatsAppGroup(teamName, participants);
          const groupId = crypto.randomUUID();
          const timestamp = new Date();

          await db.insert(whatsappGroup).values({
            id: groupId,
            name: teamName,
            jid,
            createdAt: timestamp,
            updatedAt: timestamp,
          });

          await db
            .update(team)
            .set({ whatsappGroupId: groupId })
            .where(eq(team.id, teamId));
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
    }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
      const existing = await tx.run(zql.team.where("id", args.id).one());
      if (!existing) {
        throw new Error("Team not found");
      }
      await tx.mutate.team.update({
        id: args.id,
        name: args.name,
        description: args.description ?? null,
        whatsappGroupId: args.whatsappGroupId ?? null,
        updatedAt: Date.now(),
      });
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
      const existing = await tx.run(
        zql.team.where("id", args.id).related("members").one()
      );
      if (!existing) {
        throw new Error("Team not found");
      }
      for (const member of existing.members) {
        await tx.mutate.teamMember.delete({ id: member.id });
      }
      await tx.mutate.team.delete({ id: args.id });
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
      if (ctx.role !== "admin") {
        const membership = await tx.run(
          zql.teamMember
            .where("teamId", args.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        );
        if (!membership) {
          throw new Error("Unauthorized");
        }
      }

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
        ctx.asyncTasks?.push(async () => {
          const { addToWhatsAppGroup, getTeamWhatsAppGroupJid, getUserPhone } =
            await import("@pi-dash/whatsapp");

          const jid = await getTeamWhatsAppGroupJid(teamId);
          if (!jid) {
            return;
          }

          const phone = await getUserPhone(userId);
          if (!phone) {
            return;
          }

          await addToWhatsAppGroup(jid, phone);
        });
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
      if (ctx.role !== "admin") {
        const membership = await tx.run(
          zql.teamMember
            .where("teamId", args.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        );
        if (!membership) {
          throw new Error("Unauthorized");
        }
      }

      const member = await tx.run(
        zql.teamMember.where("id", args.memberId).one()
      );
      if (!member) {
        throw new Error("Member not found");
      }

      if (ctx.role !== "admin" && member.role === "lead") {
        throw new Error("Team leads cannot remove other leads");
      }

      const memberUserId = member.userId;
      await tx.mutate.teamMember.delete({ id: args.memberId });

      if (tx.location === "server") {
        const teamId = args.teamId;
        ctx.asyncTasks?.push(async () => {
          const {
            getTeamWhatsAppGroupJid,
            getUserPhone,
            removeFromWhatsAppGroup,
          } = await import("@pi-dash/whatsapp");

          const jid = await getTeamWhatsAppGroupJid(teamId);
          if (!jid) {
            return;
          }

          const phone = await getUserPhone(memberUserId);
          if (!phone) {
            return;
          }

          await removeFromWhatsAppGroup(jid, phone);
        });
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
      if (ctx.role !== "admin") {
        const membership = await tx.run(
          zql.teamMember
            .where("teamId", member.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        );
        if (!membership) {
          throw new Error("Unauthorized");
        }
      }
      await tx.mutate.teamMember.update({
        id: args.memberId,
        role: args.role,
      });
    }
  ),
};
