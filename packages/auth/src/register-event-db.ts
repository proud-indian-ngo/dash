import { db } from "@pi-dash/db";
import { promoteKalakritiVolunteer } from "@pi-dash/db/kalakriti-orientation";
import { invalidatePermissionCache } from "@pi-dash/db/queries/resolve-permissions";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiExternalIdentity,
} from "@pi-dash/db/schema/kalakriti";
import { role } from "@pi-dash/db/schema/permission";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { and, eq } from "drizzle-orm";

import type { RegisterEventEnrollDeps } from "./register-event";

function toEpoch(value: Date | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date ? value.getTime() : value;
}

export function createDbRegisterEventEnrollDeps(): RegisterEventEnrollDeps {
  return {
    enqueueNotifyAddedToEvent: async (payload) => {
      await enqueue("notify-added-to-event", payload);
    },
    enqueueWhatsappAddMember: async (payload) => {
      await enqueue("whatsapp-add-member", payload);
    },
    findEditionByTeamEventId: async (teamEventId) => {
      const [row] = await db
        .select({
          id: kalakritiEdition.id,
          lifecycle: kalakritiEdition.lifecycle,
          teamEventId: kalakritiEdition.teamEventId,
        })
        .from(kalakritiEdition)
        .where(eq(kalakritiEdition.teamEventId, teamEventId))
        .limit(1);
      return row ?? null;
    },
    findEvent: async (eventId) => {
      const [row] = await db
        .select({
          cancelledAt: teamEvent.cancelledAt,
          id: teamEvent.id,
          location: teamEvent.location,
          managementDomain: teamEvent.managementDomain,
          name: teamEvent.name,
          startTime: teamEvent.startTime,
          whatsappGroupId: teamEvent.whatsappGroupId,
        })
        .from(teamEvent)
        .where(eq(teamEvent.id, eventId))
        .limit(1);
      if (!row) {
        return null;
      }
      return {
        cancelledAt: toEpoch(row.cancelledAt),
        id: row.id,
        location: row.location,
        managementDomain: row.managementDomain ?? null,
        name: row.name,
        startTime: row.startTime.getTime(),
        whatsappGroupId: row.whatsappGroupId,
      };
    },
    findUser: async (userId) => {
      const [row] = await db
        .select({
          email: user.email,
          id: user.id,
          name: user.name,
          phone: user.phone,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      return row ?? null;
    },
    persistEnrollWrites: async (row) => {
      const { memberResult, promoted } = await db.transaction(async (tx) => {
        const skipped = { memberResult: "skipped" as const, promoted: false };
        // Match the Edition-first locking order of Kalakriti commands.
        const [edition] = await tx
          .select({
            id: kalakritiEdition.id,
            lifecycle: kalakritiEdition.lifecycle,
          })
          .from(kalakritiEdition)
          .where(eq(kalakritiEdition.teamEventId, row.eventMember.eventId))
          .limit(1)
          .for("update");
        const [event] = await tx
          .select({
            cancelledAt: teamEvent.cancelledAt,
            managementDomain: teamEvent.managementDomain,
            startTime: teamEvent.startTime,
          })
          .from(teamEvent)
          .where(eq(teamEvent.id, row.eventMember.eventId))
          .limit(1)
          .for("update");
        if (
          !event ||
          event.cancelledAt !== null ||
          event.startTime.getTime() <=
            Math.max(Date.now(), row.eventMember.addedAt)
        ) {
          return skipped;
        }
        if (
          edition ||
          event.managementDomain === "kalakriti" ||
          row.volunteerMembership
        ) {
          if (
            !edition ||
            edition.lifecycle === "archived" ||
            !row.volunteerMembership ||
            edition.id !== row.volunteerMembership.editionId
          ) {
            return skipped;
          }
        }
        const [enrollingUser] = await tx
          .select({ id: user.id, role: user.role })
          .from(user)
          .where(eq(user.id, row.eventMember.userId))
          .limit(1)
          .for("update");
        const [external] = await tx
          .select({ userId: kalakritiExternalIdentity.userId })
          .from(kalakritiExternalIdentity)
          .where(eq(kalakritiExternalIdentity.userId, row.eventMember.userId))
          .limit(1);
        if (
          !enrollingUser ||
          enrollingUser.role === "external_user" ||
          external
        ) {
          return skipped;
        }

        let promoted = false;
        if (row.volunteerMembership) {
          const volunteer = row.volunteerMembership;
          const [existing] = await tx
            .select({
              id: kalakritiEditionMembership.id,
              kind: kalakritiEditionMembership.kind,
              state: kalakritiEditionMembership.state,
            })
            .from(kalakritiEditionMembership)
            .where(
              and(
                eq(kalakritiEditionMembership.editionId, volunteer.editionId),
                eq(kalakritiEditionMembership.userId, volunteer.userId)
              )
            )
            .limit(1)
            .for("update");
          if (
            existing &&
            (existing.kind !== "volunteer" ||
              (existing.state !== "active" && existing.state !== "archived"))
          ) {
            return skipped;
          }
          if (!existing) {
            await tx.insert(kalakritiEditionMembership).values({
              archivedAt: null,
              createdAt: new Date(volunteer.now),
              createdBy: volunteer.createdBy,
              editionId: volunteer.editionId,
              id: volunteer.id,
              kind: "volunteer",
              snapshotEmail: volunteer.snapshotEmail,
              snapshotName: volunteer.snapshotName,
              snapshotPhone: volunteer.snapshotPhone,
              state: "active",
              updatedAt: new Date(volunteer.now),
              userId: volunteer.userId,
            });
          } else if (existing.state === "archived") {
            await tx
              .update(kalakritiEditionMembership)
              .set({
                archivedAt: null,
                snapshotEmail: volunteer.snapshotEmail,
                snapshotName: volunteer.snapshotName,
                snapshotPhone: volunteer.snapshotPhone,
                state: "active",
                updatedAt: new Date(volunteer.now),
              })
              .where(eq(kalakritiEditionMembership.id, existing.id));
          }
        }

        const inserted = await tx
          .insert(teamEventMember)
          .values({
            addedAt: new Date(row.eventMember.addedAt),
            eventId: row.eventMember.eventId,
            id: row.eventMember.id,
            userId: row.eventMember.userId,
          })
          .onConflictDoNothing({
            target: [teamEventMember.eventId, teamEventMember.userId],
          })
          .returning({ id: teamEventMember.id });
        const memberResult =
          inserted.length > 0 ? ("inserted" as const) : ("conflict" as const);
        if (row.volunteerMembership) {
          promoted = await promoteKalakritiVolunteer(
            tx,
            row.volunteerMembership.userId,
            row.volunteerMembership.now
          );
        }
        return { memberResult, promoted };
      });
      if (promoted) {
        invalidatePermissionCache("unoriented_volunteer");
        invalidatePermissionCache("volunteer");
        const userId = row.eventMember.userId;
        withFireAndForgetLog(
          { handler: "registerEventEnroll:roleChanged", userId },
          async () => {
            const [volunteerRole] = await db
              .select({ name: role.name })
              .from(role)
              .where(eq(role.id, "volunteer"))
              .limit(1);
            await enqueue("notify-role-changed", {
              newRole: volunteerRole?.name ?? "volunteer",
              userId,
            });
          }
        );
        withFireAndForgetLog(
          { handler: "registerEventEnroll:orientation", userId },
          async () => {
            await enqueue("whatsapp-manage-orientation", {
              isOriented: true,
              userId,
            });
          }
        );
      }
      return memberResult;
    },
  };
}
