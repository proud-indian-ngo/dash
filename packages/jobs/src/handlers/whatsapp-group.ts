import { db } from "@pi-dash/db";
import { team } from "@pi-dash/db/schema/team";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import {
  addToWhatsAppGroup,
  addUsersToWhatsAppGroup,
  createWhatsAppGroup,
  getTeamWhatsAppGroupJid,
  manageOrientationGroupMembership,
  removeFromWhatsAppGroup,
} from "@pi-dash/whatsapp/groups";
import { getUserPhone, getUserPhones } from "@pi-dash/whatsapp/users";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type {
  WhatsAppAddMemberPayload,
  WhatsAppAddMembersPayload,
  WhatsAppAddMemberTeamPayload,
  WhatsAppCreateGroupPayload,
  WhatsAppManageOrientationPayload,
  WhatsAppRemoveMemberPayload,
  WhatsAppRemoveMemberTeamPayload,
} from "../enqueue";

export async function handleWhatsAppCreateGroup(
  jobs: Job<WhatsAppCreateGroupPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "whatsapp-create-group",
    });
    const { entityType, entityId, groupName, creatorUserId } = job.data;
    log.set({ jobId: job.id, entityType, entityId, groupName, creatorUserId });

    const creatorPhone = await getUserPhone(creatorUserId);
    const participants = creatorPhone ? [creatorPhone] : [];
    const { jid } = await createWhatsAppGroup(groupName, participants);
    const groupId = crypto.randomUUID();
    const timestamp = new Date();

    await db.insert(whatsappGroup).values({
      id: groupId,
      name: groupName,
      jid,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Link the group to the entity
    if (entityType === "team") {
      await db
        .update(team)
        .set({ whatsappGroupId: groupId })
        .where(eq(team.id, entityId));
    } else {
      await db
        .update(teamEvent)
        .set({ whatsappGroupId: groupId })
        .where(eq(teamEvent.id, entityId));
    }

    log.set({ event: "job_complete", groupId, jid });
    log.emit();
  }
}

export async function handleWhatsAppAddMember(
  jobs: Job<WhatsAppAddMemberPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "whatsapp-add-member",
    });
    const { groupId, userId } = job.data;
    log.set({ jobId: job.id, groupId, userId });

    const group = await db.query.whatsappGroup.findFirst({
      where: (t, { eq }) => eq(t.id, groupId),
    });
    if (group) {
      const phone = await getUserPhone(userId);
      if (phone) {
        await addToWhatsAppGroup(group.jid, phone);
      }
    }

    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleWhatsAppAddMembers(
  jobs: Job<WhatsAppAddMembersPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "whatsapp-add-members",
    });
    const { groupId, userIds } = job.data;
    log.set({ jobId: job.id, groupId, userCount: userIds.length });

    const group = await db.query.whatsappGroup.findFirst({
      where: (t, { eq }) => eq(t.id, groupId),
    });
    if (group) {
      const phoneMap = await getUserPhones(userIds);
      const phones = [...phoneMap.values()];
      await addUsersToWhatsAppGroup(group.jid, phones);
    }

    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleWhatsAppRemoveMember(
  jobs: Job<WhatsAppRemoveMemberPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "whatsapp-remove-member",
    });
    const { groupId, userId } = job.data;
    log.set({ jobId: job.id, groupId, userId });

    const group = await db.query.whatsappGroup.findFirst({
      where: (t, { eq }) => eq(t.id, groupId),
    });
    if (group) {
      const phone = await getUserPhone(userId);
      if (phone) {
        await removeFromWhatsAppGroup(group.jid, phone);
      }
    }

    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleWhatsAppAddMemberTeam(
  jobs: Job<WhatsAppAddMemberTeamPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "whatsapp-add-member-team",
    });
    const { teamId, userId } = job.data;
    log.set({ jobId: job.id, teamId, userId });

    const jid = await getTeamWhatsAppGroupJid(teamId);
    if (jid) {
      const phone = await getUserPhone(userId);
      if (phone) {
        await addToWhatsAppGroup(jid, phone);
      }
    }

    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleWhatsAppRemoveMemberTeam(
  jobs: Job<WhatsAppRemoveMemberTeamPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "whatsapp-remove-member-team",
    });
    const { teamId, userId } = job.data;
    log.set({ jobId: job.id, teamId, userId });

    const jid = await getTeamWhatsAppGroupJid(teamId);
    if (jid) {
      const phone = await getUserPhone(userId);
      if (phone) {
        await removeFromWhatsAppGroup(jid, phone);
      }
    }

    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleWhatsAppManageOrientation(
  jobs: Job<WhatsAppManageOrientationPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "whatsapp-manage-orientation",
    });
    const { userId, isOriented } = job.data;
    log.set({ jobId: job.id, userId, isOriented });

    await manageOrientationGroupMembership(userId, isOriented);

    log.set({ event: "job_complete" });
    log.emit();
  }
}
