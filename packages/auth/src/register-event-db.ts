import { createHash, randomBytes } from "node:crypto";

import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiCredential,
  kalakritiEdition,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { formatKalakritiVolunteerHumanId } from "@pi-dash/shared/kalakriti";
import { and, eq, isNull } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import type { RegisterEventEnrollDeps } from "./register-event";

function toEpoch(value: Date | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date ? value.getTime() : value;
}

function createCredentialTokenHash(): string {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

async function issueVolunteerCredentialForMembership(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    actorUserId: string;
    editionId: string;
    membershipId: string;
    now: number;
  }
): Promise<void> {
  const [edition] = await tx
    .select({
      lifecycle: kalakritiEdition.lifecycle,
      nextVolunteerSequence: kalakritiEdition.nextVolunteerSequence,
      year: kalakritiEdition.year,
    })
    .from(kalakritiEdition)
    .where(eq(kalakritiEdition.id, input.editionId))
    .for("update");
  if (!edition || edition.lifecycle === "archived") {
    return;
  }

  const [membership] = await tx
    .select({
      humanId: kalakritiEditionMembership.humanId,
      kind: kalakritiEditionMembership.kind,
    })
    .from(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.id, input.membershipId))
    .limit(1);
  if (membership?.kind !== "volunteer") {
    return;
  }

  const [activeCredential] = await tx
    .select({ id: kalakritiCredential.id })
    .from(kalakritiCredential)
    .where(
      and(
        eq(kalakritiCredential.membershipId, input.membershipId),
        isNull(kalakritiCredential.revokedAt)
      )
    )
    .limit(1);
  if (activeCredential) {
    return;
  }

  const { humanId: existingHumanId } = membership;
  let humanId = existingHumanId;
  if (!humanId) {
    humanId = formatKalakritiVolunteerHumanId(
      edition.year,
      edition.nextVolunteerSequence
    );
    await tx
      .update(kalakritiEditionMembership)
      .set({ humanId, updatedAt: new Date(input.now) })
      .where(eq(kalakritiEditionMembership.id, input.membershipId));
    await tx
      .update(kalakritiEdition)
      .set({
        nextVolunteerSequence: edition.nextVolunteerSequence + 1,
      })
      .where(eq(kalakritiEdition.id, input.editionId));
  }

  await tx.insert(kalakritiCredential).values({
    createdAt: new Date(input.now),
    editionId: input.editionId,
    humanId,
    id: uuidv7(),
    issuedAt: new Date(input.now),
    issuedBy: input.actorUserId,
    membershipId: input.membershipId,
    revokedAt: null,
    revokedBy: null,
    studentId: null,
    tokenHash: createCredentialTokenHash(),
  });
}

async function persistVolunteerMembershipEnroll(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  volunteer: NonNullable<
    Parameters<
      RegisterEventEnrollDeps["persistEnrollWrites"]
    >[0]["volunteerMembership"]
  >
): Promise<void> {
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
    .limit(1);
  if (existing?.kind === "guardian") {
    return;
  }
  let membershipId = existing?.id;
  let shouldIssueCredential = false;
  if (!existing) {
    membershipId = volunteer.id;
    await tx.insert(kalakritiEditionMembership).values({
      archivedAt: null,
      createdAt: new Date(volunteer.now),
      createdBy: volunteer.createdBy,
      editionId: volunteer.editionId,
      humanId: null,
      id: volunteer.id,
      kind: "volunteer",
      snapshotEmail: volunteer.snapshotEmail,
      snapshotName: volunteer.snapshotName,
      snapshotPhone: volunteer.snapshotPhone,
      state: "active",
      updatedAt: new Date(volunteer.now),
      userId: volunteer.userId,
    });
    shouldIssueCredential = true;
  } else if (existing.state === "archived") {
    membershipId = existing.id;
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
    const [activeCredential] = await tx
      .select({ id: kalakritiCredential.id })
      .from(kalakritiCredential)
      .where(
        and(
          eq(kalakritiCredential.membershipId, existing.id),
          isNull(kalakritiCredential.revokedAt)
        )
      )
      .limit(1);
    shouldIssueCredential = !activeCredential;
  }
  if (shouldIssueCredential && membershipId) {
    await issueVolunteerCredentialForMembership(tx, {
      actorUserId: volunteer.createdBy,
      editionId: volunteer.editionId,
      membershipId,
      now: volunteer.now,
    });
  }
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
    persistEnrollWrites: async (row) =>
      await db.transaction(async (tx) => {
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
          await persistVolunteerMembershipEnroll(tx, row.volunteerMembership);
        }

        return memberResult;
      }),
  };
}
