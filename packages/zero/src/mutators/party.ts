import { partyKindValues, partyRoleValues } from "@pi-dash/shared/constants";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertHasPermission } from "../permissions";
import { zql } from "../schema";

const displayName = z.string().trim().min(1).max(160);

export const partyMutators = {
  create: defineMutator(
    z.object({
      displayName,
      id: z.string(),
      kind: z.enum(partyKindValues),
      legalName: z.string().trim().max(200).nullable().optional(),
      roleIds: z.array(z.string()).min(1).max(partyRoleValues.length),
      roles: z.array(z.enum(partyRoleValues)).min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "donors.manage");
      if (args.roleIds.length !== args.roles.length) {
        throw new Error("One role ID is needed per role");
      }
      const now = Date.now();
      await tx.mutate.party.insert({
        createdAt: now,
        createdBy: ctx.userId,
        displayName: args.displayName,
        id: args.id,
        kind: args.kind,
        legalName: args.legalName ?? null,
        updatedAt: now,
      });
      const unique = [...new Set(args.roles)];
      for (const [index, role] of unique.entries()) {
        await tx.mutate.partyRole.insert({
          active: true,
          id: args.roleIds[index] as string,
          partyId: args.id,
          role,
          since: now,
        });
      }
    }
  ),
  setRole: defineMutator(
    z.object({
      active: z.boolean(),
      id: z.string(),
      partyId: z.string(),
      role: z.enum(partyRoleValues),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "donors.manage");
      const party = await tx.run(zql.party.where("id", args.partyId).one());
      if (!party) {
        throw new Error("Party not found");
      }
      const existing = await tx.run(
        zql.partyRole
          .where("partyId", args.partyId)
          .where("role", args.role)
          .one()
      );
      if (existing) {
        await tx.mutate.partyRole.update({
          active: args.active,
          id: existing.id,
        });
        return;
      }
      if (args.active) {
        await tx.mutate.partyRole.insert({
          active: true,
          id: args.id,
          partyId: args.partyId,
          role: args.role,
          since: Date.now(),
        });
      }
    }
  ),
  update: defineMutator(
    z.object({
      displayName,
      id: z.string(),
      kind: z.enum(partyKindValues).optional(),
      legalName: z.string().trim().max(200).nullable().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "donors.manage");
      const existing = await tx.run(zql.party.where("id", args.id).one());
      if (!existing) {
        throw new Error("Party not found");
      }
      await tx.mutate.party.update({
        displayName: args.displayName,
        id: args.id,
        kind: args.kind ?? existing.kind,
        legalName:
          args.legalName === undefined ? existing.legalName : args.legalName,
        updatedAt: Date.now(),
      });
    }
  ),
};
