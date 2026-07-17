import {
  canManageKalakritiResponsibility,
  KALAKRITI_EDITION_SCOPED_RESPONSIBILITIES,
  type KalakritiResponsibility,
} from "@pi-dash/shared/kalakriti";
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

interface AssignmentTx {
  location: "client" | "server";
  mutate: {
    kalakritiAssignment: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
    kalakritiAuditEntry: { insert: ZeroMutationFn };
    kalakritiEditionMembership: {
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
    teamEventMember: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
    };
  };
  run: ZeroRunFn;
}

async function assertCanManageResponsibility(
  tx: AssignmentTx,
  ctx: Context | undefined,
  editionId: string,
  responsibility: KalakritiResponsibility
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

  const assignments = (await tx.run(
    zql.kalakritiAssignment.where("membershipId", membership.id)
  )) as readonly { responsibility: KalakritiResponsibility }[];
  if (
    !canManageKalakritiResponsibility(
      assignments.map((assignment) => assignment.responsibility),
      responsibility
    )
  ) {
    throw new Error("Unauthorized");
  }
}

export const kalakritiAssignmentCreateSchema = z.object({
  assignmentId: z.string(),
  auditEntryId: z.string(),
  editionId: z.string(),
  makePrimary: z.boolean(),
  membershipId: z.string(),
  now: z.number(),
  responsibility: z.enum(KALAKRITI_EDITION_SCOPED_RESPONSIBILITIES),
  teamEventMemberId: z.string(),
  userId: z.string(),
});

export const kalakritiAssignmentRemoveSchema = z.object({
  assignmentId: z.string(),
  auditEntryId: z.string(),
  now: z.number(),
});

export const kalakritiAssignmentMutators = {
  assignVolunteer: defineMutator(
    kalakritiAssignmentCreateSchema,
    async ({ tx, ctx, args }) => {
      await assertCanManageResponsibility(
        tx,
        ctx,
        args.editionId,
        args.responsibility
      );
      assertIsLoggedIn(ctx);

      const edition = await tx.run(
        zql.kalakritiEdition.where("id", args.editionId).one()
      );
      if (!edition) {
        throw new Error("Edition not found");
      }

      const volunteer = await tx.run(zql.user.where("id", args.userId).one());
      if (!volunteer && tx.location === "client") {
        return;
      }
      if (!volunteer?.isActive) {
        throw new Error("Active volunteer not found");
      }
      const externalIdentity = await tx.run(
        zql.kalakritiExternalIdentity.where("userId", args.userId).one()
      );
      if (volunteer.role === "external_user" || externalIdentity) {
        throw new Error("External identities cannot be volunteer assignments");
      }

      const membership = await tx.run(
        zql.kalakritiEditionMembership
          .where("editionId", args.editionId)
          .where("userId", args.userId)
          .one()
      );
      if (membership?.kind === "guardian") {
        throw new Error("Guardian memberships cannot receive volunteer roles");
      }

      const membershipId = membership?.id ?? args.membershipId;
      const existingAssignments = await tx.run(
        zql.kalakritiAssignment
          .where("membershipId", membershipId)
          .orderBy("createdAt", "asc")
      );
      if (
        existingAssignments.some(
          (assignment) => assignment.responsibility === args.responsibility
        )
      ) {
        throw new Error("Volunteer already has this responsibility");
      }

      if (args.responsibility === "overall_events_lead") {
        const existingLead = await tx.run(
          zql.kalakritiAssignment
            .where("editionId", args.editionId)
            .where("responsibility", "overall_events_lead")
            .one()
        );
        if (existingLead) {
          throw new Error("An Overall Events Lead is already assigned");
        }
      }

      if (!membership) {
        await tx.mutate.kalakritiEditionMembership.insert({
          archivedAt: null,
          createdAt: args.now,
          createdBy: ctx.userId,
          editionId: args.editionId,
          id: membershipId,
          kind: "volunteer",
          snapshotEmail: volunteer.email,
          snapshotName: volunteer.name,
          snapshotPhone: volunteer.phone,
          state: "active",
          updatedAt: args.now,
          userId: args.userId,
        });
      } else if (membership.state === "archived") {
        await tx.mutate.kalakritiEditionMembership.update({
          archivedAt: null,
          id: membership.id,
          snapshotEmail: volunteer.email,
          snapshotName: volunteer.name,
          snapshotPhone: volunteer.phone,
          state: "active",
          updatedAt: args.now,
        });
      }

      const shouldBePrimary =
        args.makePrimary || existingAssignments.length === 0;
      if (shouldBePrimary) {
        await Promise.all(
          existingAssignments
            .filter((assignment) => assignment.isPrimary)
            .map((assignment) =>
              tx.mutate.kalakritiAssignment.update({
                id: assignment.id,
                isPrimary: false,
              })
            )
        );
      }

      await tx.mutate.kalakritiAssignment.insert({
        centerId: null,
        competitionCategoryId: null,
        competitionId: null,
        createdAt: args.now,
        createdBy: ctx.userId,
        editionId: args.editionId,
        id: args.assignmentId,
        isPrimary: shouldBePrimary,
        membershipId,
        responsibility: args.responsibility,
      });

      const eventMember = await tx.run(
        zql.teamEventMember
          .where("eventId", edition.teamEventId)
          .where("userId", args.userId)
          .one()
      );
      if (!eventMember) {
        await tx.mutate.teamEventMember.insert({
          addedAt: args.now,
          attendance: null,
          attendanceMarkedAt: null,
          attendanceMarkedBy: null,
          eventId: edition.teamEventId,
          id: args.teamEventMemberId,
          userId: args.userId,
        });
      }

      await tx.mutate.kalakritiAuditEntry.insert({
        action: "assigned",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "volunteer_assignment",
        editionId: args.editionId,
        id: args.auditEntryId,
        metadata: { responsibility: args.responsibility, userId: args.userId },
        reason: null,
        targetId: args.assignmentId,
        targetType: "assignment",
      });
    }
  ),

  remove: defineMutator(
    kalakritiAssignmentRemoveSchema,
    async ({ tx, ctx, args }) => {
      const assignment = await tx.run(
        zql.kalakritiAssignment.where("id", args.assignmentId).one()
      );
      if (!assignment) {
        throw new Error("Assignment not found");
      }
      await assertCanManageResponsibility(
        tx,
        ctx,
        assignment.editionId,
        assignment.responsibility
      );
      assertIsLoggedIn(ctx);

      const membership = await tx.run(
        zql.kalakritiEditionMembership
          .where("id", assignment.membershipId)
          .one()
      );
      const edition = await tx.run(
        zql.kalakritiEdition.where("id", assignment.editionId).one()
      );
      if (!(membership?.userId && edition)) {
        throw new Error("Assignment membership not found");
      }

      const assignments = await tx.run(
        zql.kalakritiAssignment
          .where("membershipId", membership.id)
          .orderBy("createdAt", "asc")
      );
      const remaining = assignments.filter((item) => item.id !== assignment.id);

      await tx.mutate.kalakritiAssignment.delete({ id: assignment.id });

      if (remaining.length === 0) {
        await tx.mutate.kalakritiEditionMembership.update({
          archivedAt: args.now,
          id: membership.id,
          state: "archived",
          updatedAt: args.now,
        });
        const eventMember = await tx.run(
          zql.teamEventMember
            .where("eventId", edition.teamEventId)
            .where("userId", membership.userId)
            .one()
        );
        if (eventMember) {
          await tx.mutate.teamEventMember.delete({ id: eventMember.id });
        }
      } else if (assignment.isPrimary) {
        const [nextPrimary] = remaining;
        if (!nextPrimary) {
          throw new Error("Assignment state changed while removing role");
        }
        await tx.mutate.kalakritiAssignment.update({
          id: nextPrimary.id,
          isPrimary: true,
        });
      }

      await tx.mutate.kalakritiAuditEntry.insert({
        action: "removed",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "volunteer_assignment",
        editionId: assignment.editionId,
        id: args.auditEntryId,
        metadata: {
          responsibility: assignment.responsibility,
          userId: membership.userId,
        },
        reason: null,
        targetId: assignment.id,
        targetType: "assignment",
      });
    }
  ),
};
