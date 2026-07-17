import { normalizeKalakritiCenterName } from "@pi-dash/shared/kalakriti";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import type { Context } from "../context";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}

abstract class BivariantZeroRun {
  abstract bivarianceHack(query: unknown): Promise<unknown>;
}

type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];
type ZeroRunFn = BivariantZeroRun["bivarianceHack"];

interface CenterTx {
  location: "client" | "server";
  mutate: {
    kalakritiAuditEntry: { insert: ZeroMutationFn };
    kalakritiCenter: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
  };
  run: ZeroRunFn;
}

interface CenterRecord {
  competitionEntryRegistrationEnabled: boolean;
  editionId: string;
  id: string;
  retiredAt: number | null;
  studentRegistrationEnabled: boolean;
}

async function assertCenterAdmin(
  tx: CenterTx,
  ctx: Context | undefined,
  editionId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  if (can(ctx, "kalakriti.admin")) {
    return;
  }
  if (!can(ctx, "kalakriti.view")) {
    throw new Error("Unauthorized");
  }

  const membership = (await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("userId", ctx.userId)
      .where("state", "active")
      .one()
  )) as { id: string } | undefined;
  if (!membership) {
    throw new Error("Unauthorized");
  }
  const assignment = await tx.run(
    zql.kalakritiAssignment
      .where("membershipId", membership.id)
      .where("responsibility", "edition_admin")
      .one()
  );
  if (!assignment) {
    throw new Error("Unauthorized");
  }
}

async function assertEditionConfigurable(
  tx: CenterTx,
  editionId: string
): Promise<void> {
  const edition = (await tx.run(
    zql.kalakritiEdition.where("id", editionId).one()
  )) as { lifecycle: string } | undefined;
  if (!edition) {
    throw new Error("Edition not found");
  }
  if (edition.lifecycle === "live" || edition.lifecycle === "archived") {
    throw new Error("Centers cannot be changed in this Edition state");
  }
}

async function getCenter(tx: CenterTx, centerId: string) {
  const center = (await tx.run(
    zql.kalakritiCenter.where("id", centerId).one()
  )) as CenterRecord | undefined;
  if (!center) {
    throw new Error("Center not found");
  }
  return center;
}

const centerNameSchema = z.string().trim().min(2).max(120);

export const kalakritiCenterCreateSchema = z.object({
  auditEntryId: z.string(),
  centerId: z.string(),
  editionId: z.string(),
  name: centerNameSchema,
  now: z.number(),
});

export const kalakritiCenterUpdateSchema = z.object({
  auditEntryId: z.string(),
  centerId: z.string(),
  name: centerNameSchema,
  now: z.number(),
});

export const kalakritiCenterActionSchema = z.object({
  auditEntryId: z.string(),
  centerId: z.string(),
  now: z.number(),
});

export const kalakritiCenterControlsSchema = z.object({
  auditEntryId: z.string(),
  centerId: z.string(),
  competitionEntryRegistrationEnabled: z.boolean(),
  confirmReopen: z.boolean(),
  now: z.number(),
  studentRegistrationEnabled: z.boolean(),
});

export const kalakritiCenterBulkLockSchema = z.object({
  auditEntryId: z.string(),
  confirmLock: z.literal(true),
  editionId: z.string(),
  now: z.number(),
});

export const kalakritiCenterMutators = {
  create: defineMutator(
    kalakritiCenterCreateSchema,
    async ({ tx, ctx, args }) => {
      await assertCenterAdmin(tx, ctx, args.editionId);
      await assertEditionConfigurable(tx, args.editionId);
      assertIsLoggedIn(ctx);
      const normalized = normalizeKalakritiCenterName(args.name);

      await tx.mutate.kalakritiCenter.insert({
        competitionEntryRegistrationEnabled: false,
        createdAt: args.now,
        createdBy: ctx.userId,
        editionId: args.editionId,
        id: args.centerId,
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        retiredAt: null,
        studentRegistrationEnabled: false,
        updatedAt: args.now,
      });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "created",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "center_configuration",
        editionId: args.editionId,
        id: args.auditEntryId,
        metadata: { name: normalized.name },
        reason: null,
        targetId: args.centerId,
        targetType: "center",
      });
    }
  ),

  delete: defineMutator(
    kalakritiCenterActionSchema,
    async ({ tx, ctx, args }) => {
      const center = await getCenter(tx, args.centerId);
      await assertCenterAdmin(tx, ctx, center.editionId);
      await assertEditionConfigurable(tx, center.editionId);
      assertIsLoggedIn(ctx);
      const [guardianCenter, assignment] = await Promise.all([
        tx.run(zql.kalakritiGuardianCenter.where("centerId", center.id).one()),
        tx.run(zql.kalakritiAssignment.where("centerId", center.id).one()),
      ]);
      if (guardianCenter || assignment) {
        throw new Error(
          "Center has dependent assignments and cannot be deleted"
        );
      }

      await tx.mutate.kalakritiCenter.delete({ id: center.id });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "deleted",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "center_configuration",
        editionId: center.editionId,
        id: args.auditEntryId,
        metadata: null,
        reason: null,
        targetId: center.id,
        targetType: "center",
      });
    }
  ),

  lockAllRegistration: defineMutator(
    kalakritiCenterBulkLockSchema,
    async ({ tx, ctx, args }) => {
      await assertCenterAdmin(tx, ctx, args.editionId);
      await assertEditionConfigurable(tx, args.editionId);
      assertIsLoggedIn(ctx);
      const centers = (await tx.run(
        zql.kalakritiCenter.where("editionId", args.editionId)
      )) as CenterRecord[];
      const enabledCenters = centers.filter(
        (center) =>
          center.studentRegistrationEnabled ||
          center.competitionEntryRegistrationEnabled
      );
      if (enabledCenters.length === 0) {
        throw new Error("All Center registrations are already locked");
      }

      await Promise.all(
        enabledCenters.map((center) =>
          tx.mutate.kalakritiCenter.update({
            competitionEntryRegistrationEnabled: false,
            id: center.id,
            studentRegistrationEnabled: false,
            updatedAt: args.now,
          })
        )
      );
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "bulk_locked",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "center_registration_controls",
        editionId: args.editionId,
        id: args.auditEntryId,
        metadata: { centerCount: enabledCenters.length },
        reason: null,
        targetId: args.editionId,
        targetType: "edition",
      });
    }
  ),

  retire: defineMutator(
    kalakritiCenterActionSchema,
    async ({ tx, ctx, args }) => {
      const center = await getCenter(tx, args.centerId);
      await assertCenterAdmin(tx, ctx, center.editionId);
      await assertEditionConfigurable(tx, center.editionId);
      assertIsLoggedIn(ctx);
      if (center.retiredAt !== null) {
        throw new Error("Center is already retired");
      }

      await tx.mutate.kalakritiCenter.update({
        competitionEntryRegistrationEnabled: false,
        id: center.id,
        retiredAt: args.now,
        studentRegistrationEnabled: false,
        updatedAt: args.now,
      });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "retired",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "center_configuration",
        editionId: center.editionId,
        id: args.auditEntryId,
        metadata: null,
        reason: null,
        targetId: center.id,
        targetType: "center",
      });
    }
  ),

  setRegistrationControls: defineMutator(
    kalakritiCenterControlsSchema,
    async ({ tx, ctx, args }) => {
      const center = await getCenter(tx, args.centerId);
      await assertCenterAdmin(tx, ctx, center.editionId);
      await assertEditionConfigurable(tx, center.editionId);
      assertIsLoggedIn(ctx);
      if (center.retiredAt !== null) {
        throw new Error("Retired Centers cannot reopen registration");
      }
      const reopensRegistration =
        (!center.studentRegistrationEnabled &&
          args.studentRegistrationEnabled) ||
        (!center.competitionEntryRegistrationEnabled &&
          args.competitionEntryRegistrationEnabled);
      if (reopensRegistration && !args.confirmReopen) {
        throw new Error("Reopening Center registration requires confirmation");
      }
      if (
        center.studentRegistrationEnabled === args.studentRegistrationEnabled &&
        center.competitionEntryRegistrationEnabled ===
          args.competitionEntryRegistrationEnabled
      ) {
        throw new Error("Registration controls are unchanged");
      }

      await tx.mutate.kalakritiCenter.update({
        competitionEntryRegistrationEnabled:
          args.competitionEntryRegistrationEnabled,
        id: center.id,
        studentRegistrationEnabled: args.studentRegistrationEnabled,
        updatedAt: args.now,
      });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: reopensRegistration ? "reopened" : "locked",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "center_registration_controls",
        editionId: center.editionId,
        id: args.auditEntryId,
        metadata: {
          after: {
            competitionEntryRegistrationEnabled:
              args.competitionEntryRegistrationEnabled,
            studentRegistrationEnabled: args.studentRegistrationEnabled,
          },
          before: {
            competitionEntryRegistrationEnabled:
              center.competitionEntryRegistrationEnabled,
            studentRegistrationEnabled: center.studentRegistrationEnabled,
          },
        },
        reason: null,
        targetId: center.id,
        targetType: "center",
      });
    }
  ),

  update: defineMutator(
    kalakritiCenterUpdateSchema,
    async ({ tx, ctx, args }) => {
      const center = await getCenter(tx, args.centerId);
      await assertCenterAdmin(tx, ctx, center.editionId);
      await assertEditionConfigurable(tx, center.editionId);
      assertIsLoggedIn(ctx);
      if (center.retiredAt !== null) {
        throw new Error("Retired Centers cannot be edited");
      }
      const normalized = normalizeKalakritiCenterName(args.name);

      await tx.mutate.kalakritiCenter.update({
        id: center.id,
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        updatedAt: args.now,
      });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "updated",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "center_configuration",
        editionId: center.editionId,
        id: args.auditEntryId,
        metadata: { name: normalized.name },
        reason: null,
        targetId: center.id,
        targetType: "center",
      });
    }
  ),
};
