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
import { uuidv7 } from "uuidv7";
import type {
  WhatsAppAddMemberPayload,
  WhatsAppAddMembersPayload,
  WhatsAppAddMemberTeamPayload,
  WhatsAppCreateGroupPayload,
  WhatsAppManageOrientationPayload,
  WhatsAppRemoveFromAllGroupsPayload,
  WhatsAppRemoveMemberPayload,
  WhatsAppRemoveMemberTeamPayload,
} from "../enqueue";

export async function handleWhatsAppCreateGroup(
  jobs: Job<WhatsAppCreateGroupPayload>[]
): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
      const log = createRequestLogger({
        method: "JOB",
        path: "whatsapp-create-group",
      });
      const { entityType, entityId, groupName, creatorUserId } = job.data;
      log.set({
        creatorUserId,
        entityId,
        entityType,
        groupName,
        jobId: job.id,
      });

      const creatorPhone = await getUserPhone(creatorUserId);
      const participants = creatorPhone ? [creatorPhone] : [];
      const { jid } = await createWhatsAppGroup(groupName, participants);
      const groupId = uuidv7();
      const timestamp = new Date();

      await db.insert(whatsappGroup).values({
        createdAt: timestamp,
        id: groupId,
        jid,
        name: groupName,
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
    })
  );
}

export async function handleWhatsAppAddMember(
  jobs: Job<WhatsAppAddMemberPayload>[]
): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
      const log = createRequestLogger({
        method: "JOB",
        path: "whatsapp-add-member",
      });
      const { groupId, userId } = job.data;
      log.set({ groupId, jobId: job.id, userId });

      const group = await db.query.whatsappGroup.findFirst({
        where: (row, { eq: equals }) => equals(row.id, groupId),
      });
      if (group) {
        const phone = await getUserPhone(userId);
        if (phone) {
          await addToWhatsAppGroup(group.jid, phone);
        }
      }

      log.set({ event: "job_complete" });
      log.emit();
    })
  );
}

export async function handleWhatsAppAddMembers(
  jobs: Job<WhatsAppAddMembersPayload>[]
): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
      const log = createRequestLogger({
        method: "JOB",
        path: "whatsapp-add-members",
      });
      const { groupId, userIds } = job.data;
      log.set({ groupId, jobId: job.id, userCount: userIds.length });

      const group = await db.query.whatsappGroup.findFirst({
        where: (row, { eq: equals }) => equals(row.id, groupId),
      });
      if (group) {
        const phoneMap = await getUserPhones(userIds);
        const phones = [...phoneMap.values()];
        await addUsersToWhatsAppGroup(group.jid, phones);
      }

      log.set({ event: "job_complete" });
      log.emit();
    })
  );
}

export async function handleWhatsAppRemoveMember(
  jobs: Job<WhatsAppRemoveMemberPayload>[]
): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
      const log = createRequestLogger({
        method: "JOB",
        path: "whatsapp-remove-member",
      });
      const { groupId, userId } = job.data;
      log.set({ groupId, jobId: job.id, userId });

      const group = await db.query.whatsappGroup.findFirst({
        where: (row, { eq: equals }) => equals(row.id, groupId),
      });
      if (group) {
        const phone = await getUserPhone(userId);
        if (phone) {
          await removeFromWhatsAppGroup(group.jid, phone);
        }
      }

      log.set({ event: "job_complete" });
      log.emit();
    })
  );
}

export async function handleWhatsAppAddMemberTeam(
  jobs: Job<WhatsAppAddMemberTeamPayload>[]
): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
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
    })
  );
}

export async function handleWhatsAppRemoveMemberTeam(
  jobs: Job<WhatsAppRemoveMemberTeamPayload>[]
): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
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
    })
  );
}

export async function handleWhatsAppRemoveFromAllGroups(
  jobs: Job<WhatsAppRemoveFromAllGroupsPayload>[]
): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
      const log = createRequestLogger({
        method: "JOB",
        path: "whatsapp-remove-from-all-groups",
      });
      const { phone, groupJids } = job.data;
      log.set({ groupCount: groupJids.length, jobId: job.id, phone });

      const results = await Promise.allSettled(
        groupJids.map((jid) => removeFromWhatsAppGroup(jid, phone))
      );
      const errors = results.flatMap((result) => {
        if (result.status === "fulfilled") {
          return [];
        }
        const err =
          result.reason instanceof Error
            ? result.reason
            : new Error(String(result.reason));
        log.error(err);
        return [err];
      });

      if (errors.length > 0) {
        log.set({
          event: "job_partial_failure",
          failedCount: errors.length,
          totalCount: groupJids.length,
        });
        log.emit();
        throw new Error(
          `Failed to remove from ${errors.length}/${groupJids.length} groups`
        );
      }

      log.set({ event: "job_complete" });
      log.emit();
    })
  );
}

export async function handleWhatsAppManageOrientation(
  jobs: Job<WhatsAppManageOrientationPayload>[]
): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
      const log = createRequestLogger({
        method: "JOB",
        path: "whatsapp-manage-orientation",
      });
      const { userId, isOriented } = job.data;
      log.set({ isOriented, jobId: job.id, userId });

      await manageOrientationGroupMembership(userId, isOriented);

      log.set({ event: "job_complete" });
      log.emit();
    })
  );
}
