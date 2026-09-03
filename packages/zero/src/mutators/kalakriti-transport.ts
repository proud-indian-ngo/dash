import {
  KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES,
  type KalakritiTransportStatus,
} from "@pi-dash/shared/kalakriti";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { getNextKalakritiTransportStatus } from "../kalakriti-transport-rules";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import {
  getCenterForUpdate,
  type LockableKalakritiTx,
} from "./kalakriti-row-locks";

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}

type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];

interface TransportTx extends LockableKalakritiTx {
  mutate: {
    kalakritiAuditEntry: { insert: ZeroMutationFn };
    kalakritiTransportAssignment: {
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
    kalakritiTransportStatusHistory: { insert: ZeroMutationFn };
  };
}

interface ActiveMembership {
  id: string;
  kind: "guardian" | "volunteer";
}

interface ScopedAssignment {
  centerId: string | null;
  responsibility: string;
}

async function getActiveMembership(
  tx: LockableKalakritiTx,
  ctx: Context,
  editionId: string
): Promise<ActiveMembership | undefined> {
  return (await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("userId", ctx.userId)
      .where("state", "active")
      .one()
  )) as ActiveMembership | undefined;
}

async function getScopedAssignments(
  tx: LockableKalakritiTx,
  membershipId: string
): Promise<readonly ScopedAssignment[]> {
  return (await tx.run(
    zql.kalakritiAssignment.where("membershipId", membershipId)
  )) as readonly ScopedAssignment[];
}

function hasEditionWideTransportAccess(
  assignments: readonly ScopedAssignment[]
): boolean {
  return assignments.some(
    (assignment) =>
      assignment.responsibility === "edition_admin" ||
      assignment.responsibility === "transport_lead"
  );
}

function hasCenterTransportAccess(
  assignments: readonly ScopedAssignment[],
  centerId: string
): boolean {
  return assignments.some((assignment) => {
    if (assignment.responsibility === "transport_coordinator") {
      return assignment.centerId === centerId;
    }
    if (
      (
        KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES as readonly string[]
      ).includes(assignment.responsibility)
    ) {
      return assignment.centerId === centerId;
    }
    return false;
  });
}

export async function assertCanManageCenterTransport(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string,
  centerId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  if (can(ctx, "kalakriti.admin")) {
    return;
  }

  const membership = await getActiveMembership(tx, ctx, editionId);
  if (!membership) {
    throw new Error("Unauthorized");
  }
  if (membership.kind === "guardian") {
    throw new Error("Unauthorized");
  }

  const assignments = await getScopedAssignments(tx, membership.id);
  if (hasEditionWideTransportAccess(assignments)) {
    return;
  }
  if (hasCenterTransportAccess(assignments, centerId)) {
    return;
  }
  throw new Error("Unauthorized");
}

function pushTransportChangedNotificationTask(
  tx: TransportTx,
  ctx: Context | undefined,
  payload: {
    assignmentId: string;
    centerId: string;
    changeId: string;
    editionId: string;
  }
) {
  if (tx.location !== "server") {
    return;
  }
  ctx?.asyncTasks?.push({
    fn: async () => {
      const { enqueue } = await import("@pi-dash/jobs/enqueue");
      await enqueue(
        "notify-kalakriti-transport-changed",
        {
          assignmentId: payload.assignmentId,
          centerId: payload.centerId,
          changeId: payload.changeId,
          editionId: payload.editionId,
        },
        {
          singletonKey: `kalakriti-transport-${payload.assignmentId}-${payload.changeId}`,
          traceId: ctx.traceId,
        }
      );
    },
    meta: {
      assignmentId: payload.assignmentId,
      centerId: payload.centerId,
      changeId: payload.changeId,
      editionId: payload.editionId,
      mutator: "kalakritiTransport.update",
    },
  });
}

async function requireActiveCenter(
  tx: TransportTx,
  editionId: string,
  centerId: string
) {
  const center = await getCenterForUpdate(tx, centerId);
  if (!(center && center.editionId === editionId)) {
    throw new Error("Center not found in this Edition");
  }
  if (center.retiredAt !== null) {
    throw new Error("Retired Centers cannot receive transport assignments");
  }
  return center;
}

async function requireTransportAssignment(
  tx: TransportTx,
  editionId: string,
  assignmentId: string
) {
  const assignment = (await tx.run(
    zql.kalakritiTransportAssignment.where("id", assignmentId).one()
  )) as
    | {
        centerId: string;
        driverName: string;
        driverPhone: string | null;
        editionId: string;
        id: string;
        status: KalakritiTransportStatus;
        vehicleLabel: string;
      }
    | undefined;
  if (!assignment || assignment.editionId !== editionId) {
    throw new Error("Transport assignment not found");
  }
  return assignment;
}

const transportFieldSchema = z.string().trim().min(1).max(120);
const transportNotesSchema = z.string().trim().max(500).nullable();

export const kalakritiTransportCreateSchema = z.object({
  assignmentId: z.string(),
  auditEntryId: z.string(),
  capacity: z.number().int().positive(),
  centerId: z.string(),
  driverName: transportFieldSchema,
  driverPhone: z.string().trim().max(40).nullable(),
  editionId: z.string(),
  historyId: z.string(),
  notes: transportNotesSchema,
  now: z.number(),
  vehicleLabel: transportFieldSchema,
});

export const kalakritiTransportUpdateSchema = z.object({
  assignmentId: z.string(),
  auditEntryId: z.string(),
  capacity: z.number().int().positive().optional(),
  changeId: z.string(),
  driverName: transportFieldSchema.optional(),
  driverPhone: z.string().trim().max(40).nullable().optional(),
  editionId: z.string(),
  notes: transportNotesSchema.optional(),
  now: z.number(),
  vehicleLabel: transportFieldSchema.optional(),
});

export const kalakritiTransportTransitionSchema = z.object({
  assignmentId: z.string(),
  auditEntryId: z.string(),
  editionId: z.string(),
  historyId: z.string(),
  now: z.number(),
  occurredAt: z.number(),
});

export const kalakritiTransportMutators = {
  create: defineMutator(
    kalakritiTransportCreateSchema,
    async ({ tx, ctx, args }) => {
      await assertCanManageCenterTransport(
        tx,
        ctx,
        args.editionId,
        args.centerId
      );
      assertIsLoggedIn(ctx);
      await requireActiveCenter(tx, args.editionId, args.centerId);

      await tx.mutate.kalakritiTransportAssignment.insert({
        capacity: args.capacity,
        centerId: args.centerId,
        createdAt: args.now,
        createdBy: ctx.userId,
        driverName: args.driverName,
        driverPhone: args.driverPhone,
        editionId: args.editionId,
        id: args.assignmentId,
        notes: args.notes,
        status: "planned",
        updatedAt: args.now,
        vehicleLabel: args.vehicleLabel,
      });

      await tx.mutate.kalakritiTransportStatusHistory.insert({
        actorUserId: ctx.userId,
        assignmentId: args.assignmentId,
        createdAt: args.now,
        editionId: args.editionId,
        fromStatus: null,
        id: args.historyId,
        occurredAt: args.now,
        toStatus: "planned",
      });

      await tx.mutate.kalakritiAuditEntry.insert({
        action: "created",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "transport",
        editionId: args.editionId,
        id: args.auditEntryId,
        metadata: { assignmentId: args.assignmentId },
        reason: null,
        targetId: args.assignmentId,
        targetType: "transport_assignment",
      });
    }
  ),

  transitionStatus: defineMutator(
    kalakritiTransportTransitionSchema,
    async ({ tx, ctx, args }) => {
      const assignment = await requireTransportAssignment(
        tx,
        args.editionId,
        args.assignmentId
      );
      await assertCanManageCenterTransport(
        tx,
        ctx,
        args.editionId,
        assignment.centerId
      );
      assertIsLoggedIn(ctx);

      const toStatus = getNextKalakritiTransportStatus(assignment.status);
      if (!toStatus) {
        throw new Error("Transport status cannot advance further");
      }

      await tx.mutate.kalakritiTransportAssignment.update({
        id: assignment.id,
        status: toStatus,
        updatedAt: args.now,
      });

      await tx.mutate.kalakritiTransportStatusHistory.insert({
        actorUserId: ctx.userId,
        assignmentId: assignment.id,
        createdAt: args.now,
        editionId: args.editionId,
        fromStatus: assignment.status,
        id: args.historyId,
        occurredAt: args.occurredAt,
        toStatus,
      });

      await tx.mutate.kalakritiAuditEntry.insert({
        action: "status_transitioned",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "transport",
        editionId: args.editionId,
        id: args.auditEntryId,
        metadata: { assignmentId: assignment.id, toStatus },
        reason: null,
        targetId: assignment.id,
        targetType: "transport_assignment",
      });
    }
  ),

  update: defineMutator(
    kalakritiTransportUpdateSchema,
    async ({ tx, ctx, args }) => {
      const assignment = await requireTransportAssignment(
        tx,
        args.editionId,
        args.assignmentId
      );
      await assertCanManageCenterTransport(
        tx,
        ctx,
        args.editionId,
        assignment.centerId
      );
      assertIsLoggedIn(ctx);

      const changedFields: string[] = [];
      const updates: {
        capacity?: number;
        driverName?: string;
        driverPhone?: string | null;
        notes?: string | null;
        updatedAt: number;
        vehicleLabel?: string;
      } = { updatedAt: args.now };

      if (
        args.vehicleLabel !== undefined &&
        args.vehicleLabel !== assignment.vehicleLabel
      ) {
        updates.vehicleLabel = args.vehicleLabel;
        changedFields.push("vehicleLabel");
      }
      if (
        args.driverName !== undefined &&
        args.driverName !== assignment.driverName
      ) {
        updates.driverName = args.driverName;
        changedFields.push("driverName");
      }
      if (
        args.driverPhone !== undefined &&
        args.driverPhone !== assignment.driverPhone
      ) {
        updates.driverPhone = args.driverPhone;
        changedFields.push("driverPhone");
      }
      if (args.capacity !== undefined) {
        updates.capacity = args.capacity;
        changedFields.push("capacity");
      }
      if (args.notes !== undefined) {
        updates.notes = args.notes;
        changedFields.push("notes");
      }

      if (changedFields.length === 0) {
        return;
      }

      await tx.mutate.kalakritiTransportAssignment.update({
        id: assignment.id,
        ...updates,
      });

      const notifyFields = changedFields.filter((field) =>
        ["vehicleLabel", "driverName", "driverPhone"].includes(field)
      );
      if (notifyFields.length > 0) {
        pushTransportChangedNotificationTask(tx, ctx, {
          assignmentId: assignment.id,
          centerId: assignment.centerId,
          changeId: args.changeId,
          editionId: args.editionId,
        });
      }

      await tx.mutate.kalakritiAuditEntry.insert({
        action: "updated",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "transport",
        editionId: args.editionId,
        id: args.auditEntryId,
        metadata: { assignmentId: assignment.id, changedFields },
        reason: null,
        targetId: assignment.id,
        targetType: "transport_assignment",
      });
    }
  ),
};
