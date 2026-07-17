import { normalizeKalakritiCenterName } from "@pi-dash/shared/kalakriti";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import type { Context } from "../context";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import {
  getCenterForUpdate,
  getEditionCentersForUpdate,
  getEditionMembershipForUpdate,
  getGuardianCenterForUpdate,
  type LockableKalakritiTx,
} from "./kalakriti-row-locks";

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}

type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];

interface CenterTx extends LockableKalakritiTx {
  mutate: {
    kalakritiAuditEntry: { insert: ZeroMutationFn };
    kalakritiCenter: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
    kalakritiGuardianCenter: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
    };
  };
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

async function requireLockedCenter(tx: CenterTx, centerId: string) {
  const center = await getCenterForUpdate(tx, centerId);
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

export const kalakritiGuardianCenterAssignSchema = z.object({
  auditEntryId: z.string(),
  centerId: z.string(),
  guardianCenterId: z.string(),
  membershipId: z.string(),
  now: z.number(),
});

export const kalakritiGuardianCenterRemoveSchema = z.object({
  auditEntryId: z.string(),
  guardianCenterId: z.string(),
  now: z.number(),
});

export const kalakritiCenterMutators = {
  assignGuardian: defineMutator(
    kalakritiGuardianCenterAssignSchema,
    async ({ tx, ctx, args }) => {
      const membership = (await tx.run(
        zql.kalakritiEditionMembership.where("id", args.membershipId).one()
      )) as
        | {
            editionId: string;
            id: string;
            kind: "guardian" | "volunteer";
            state: "active" | "archived";
          }
        | undefined;
      if (!membership) {
        throw new Error("Guardian membership not found");
      }
      await assertCenterAdmin(tx, ctx, membership.editionId);
      assertIsLoggedIn(ctx);

      const lockedMembership = await getEditionMembershipForUpdate(
        tx,
        args.membershipId
      );
      if (
        !lockedMembership ||
        lockedMembership.editionId !== membership.editionId ||
        lockedMembership.kind !== "guardian" ||
        lockedMembership.state !== "active"
      ) {
        throw new Error("Active Guardian membership not found");
      }
      const center = await requireLockedCenter(tx, args.centerId);
      if (center.editionId !== membership.editionId) {
        throw new Error("Center not found in this Edition");
      }
      if (center.retiredAt !== null) {
        throw new Error("Retired Centers cannot receive assignments");
      }
      const existing = await tx.run(
        zql.kalakritiGuardianCenter
          .where("membershipId", args.membershipId)
          .where("centerId", args.centerId)
          .one()
      );
      if (existing) {
        throw new Error("Guardian is already assigned to this Center");
      }

      await tx.mutate.kalakritiGuardianCenter.insert({
        centerId: args.centerId,
        createdAt: args.now,
        createdBy: ctx.userId,
        editionId: membership.editionId,
        id: args.guardianCenterId,
        membershipId: args.membershipId,
      });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "assigned",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "guardian_center_assignment",
        editionId: membership.editionId,
        id: args.auditEntryId,
        metadata: {
          centerId: args.centerId,
          membershipId: args.membershipId,
        },
        reason: null,
        targetId: args.guardianCenterId,
        targetType: "guardian_center",
      });
    }
  ),

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
      const center = await requireLockedCenter(tx, args.centerId);
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
      const centers = await getEditionCentersForUpdate(tx, args.editionId);
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

  removeGuardian: defineMutator(
    kalakritiGuardianCenterRemoveSchema,
    async ({ tx, ctx, args }) => {
      const assignment = (await tx.run(
        zql.kalakritiGuardianCenter.where("id", args.guardianCenterId).one()
      )) as
        | {
            editionId: string;
            membershipId: string;
          }
        | undefined;
      if (!assignment) {
        throw new Error("Guardian Center assignment not found");
      }
      await assertCenterAdmin(tx, ctx, assignment.editionId);
      assertIsLoggedIn(ctx);

      const membership = await getEditionMembershipForUpdate(
        tx,
        assignment.membershipId
      );
      if (!membership || membership.editionId !== assignment.editionId) {
        throw new Error("Guardian membership not found");
      }
      const lockedAssignment = await getGuardianCenterForUpdate(
        tx,
        args.guardianCenterId
      );
      if (
        !lockedAssignment ||
        lockedAssignment.editionId !== assignment.editionId ||
        lockedAssignment.membershipId !== assignment.membershipId
      ) {
        throw new Error("Guardian Center assignment not found");
      }

      await tx.mutate.kalakritiGuardianCenter.delete({
        id: args.guardianCenterId,
      });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "removed",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "guardian_center_assignment",
        editionId: assignment.editionId,
        id: args.auditEntryId,
        metadata: {
          centerId: lockedAssignment.centerId,
          membershipId: lockedAssignment.membershipId,
        },
        reason: null,
        targetId: args.guardianCenterId,
        targetType: "guardian_center",
      });
    }
  ),

  retire: defineMutator(
    kalakritiCenterActionSchema,
    async ({ tx, ctx, args }) => {
      const center = await requireLockedCenter(tx, args.centerId);
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
      const center = await requireLockedCenter(tx, args.centerId);
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
      const center = await requireLockedCenter(tx, args.centerId);
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
