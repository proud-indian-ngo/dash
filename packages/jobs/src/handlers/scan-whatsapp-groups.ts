import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { getUserIdsWithPermission } from "@pi-dash/notifications/helpers";
import { notifyWhatsAppScanResults } from "@pi-dash/notifications/send/reminders";
import {
  getGroupInfoByConfigKey,
  getGroupParticipants,
} from "@pi-dash/whatsapp/groups";
import { formatPhoneForWhatsApp } from "@pi-dash/whatsapp/phone";
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { ScanWhatsAppGroupsPayload } from "../enqueue";

interface GroupInfo {
  jid: string;
  members: string[];
  name: string;
}

async function fetchGroups(): Promise<GroupInfo[]> {
  const [orientationInfo, allVolunteersInfo] = await Promise.all([
    getGroupInfoByConfigKey("orientation_group_id"),
    getGroupInfoByConfigKey("all_volunteers_group_id"),
  ]);

  if (!(orientationInfo || allVolunteersInfo)) {
    return [];
  }

  const fetchResults = await Promise.all([
    orientationInfo ? getGroupParticipants(orientationInfo.jid) : [],
    allVolunteersInfo ? getGroupParticipants(allVolunteersInfo.jid) : [],
  ]);

  const groups: GroupInfo[] = [];
  if (orientationInfo) {
    groups.push({
      jid: orientationInfo.jid,
      name: orientationInfo.name,
      members: fetchResults[0],
    });
  }
  if (allVolunteersInfo) {
    groups.push({
      jid: allVolunteersInfo.jid,
      name: allVolunteersInfo.name,
      members: fetchResults[1],
    });
  }
  return groups;
}

function findUsersNotInGroups(
  activeUsers: Array<{ id: string; name: string; phone: string | null }>,
  groupPhones: Set<string>
): Array<{ id: string; name: string; phone: string }> {
  const result: Array<{ id: string; name: string; phone: string }> = [];
  for (const u of activeUsers) {
    if (!u.phone) {
      continue;
    }
    const normalized = formatPhoneForWhatsApp(u.phone);
    if (!groupPhones.has(normalized)) {
      result.push({ id: u.id, name: u.name, phone: u.phone });
    }
  }
  return result;
}

function findUnregisteredByGroup(
  groups: GroupInfo[],
  registeredPhones: Set<string>
): Array<{ groupName: string; phones: string[] }> {
  const result: Array<{ groupName: string; phones: string[] }> = [];
  for (const group of groups) {
    const unregistered = group.members.filter((p) => !registeredPhones.has(p));
    if (unregistered.length > 0) {
      result.push({ groupName: group.name, phones: unregistered });
    }
  }
  return result;
}

export async function handleScanWhatsAppGroups(
  _jobs: Job<ScanWhatsAppGroupsPayload>[]
): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "scan-whatsapp-groups",
  });

  const groups = await fetchGroups();

  if (groups.length === 0) {
    log.set({ event: "no_groups_configured" });
    log.emit();
    return;
  }

  const groupPhones = new Set<string>(groups.flatMap((g) => g.members));

  log.set({
    groups: groups.map((g) => ({ name: g.name, count: g.members.length })),
    combinedUniqueCount: groupPhones.size,
  });

  // Safety: abort if groups are configured but returned no participants
  // (likely an API failure — prevents mass deactivation)
  if (groupPhones.size === 0) {
    log.set({ event: "empty_participants_safety_abort" });
    log.emit();
    return;
  }

  const activeUsers = await db
    .select({ id: user.id, name: user.name, phone: user.phone })
    .from(user)
    .where(
      and(
        eq(user.isActive, true),
        eq(user.isOnWhatsapp, true),
        isNotNull(user.phone)
      )
    );

  const toDeactivate = findUsersNotInGroups(activeUsers, groupPhones);

  // Reactivate inactive non-banned users who are present in the groups
  const inactiveUsers = await db
    .select({ id: user.id, name: user.name, phone: user.phone })
    .from(user)
    .where(
      and(
        eq(user.isActive, false),
        or(eq(user.banned, false), isNull(user.banned)),
        isNotNull(user.phone)
      )
    );

  const toReactivate: Array<{ id: string; name: string; phone: string }> = [];
  for (const u of inactiveUsers) {
    if (!u.phone) {
      continue;
    }
    const normalized = formatPhoneForWhatsApp(u.phone);
    if (groupPhones.has(normalized)) {
      toReactivate.push({ id: u.id, name: u.name, phone: u.phone });
    }
  }

  // Apply deactivations and reactivations in a single transaction
  if (toDeactivate.length > 0 || toReactivate.length > 0) {
    await db.transaction(async (tx) => {
      if (toDeactivate.length > 0) {
        await tx
          .update(user)
          .set({ isActive: false })
          .where(
            inArray(
              user.id,
              toDeactivate.map((u) => u.id)
            )
          );
      }
      if (toReactivate.length > 0) {
        await tx
          .update(user)
          .set({ isActive: true })
          .where(
            inArray(
              user.id,
              toReactivate.map((u) => u.id)
            )
          );
      }
    });
  }

  // Build registeredPhones from already-fetched data
  const registeredPhones = new Set(
    [...activeUsers, ...inactiveUsers]
      .filter(
        (u): u is { id: string; name: string; phone: string } =>
          u.phone !== null
      )
      .map((u) => formatPhoneForWhatsApp(u.phone))
  );

  const unregisteredByGroup = findUnregisteredByGroup(groups, registeredPhones);
  const totalUnregistered = unregisteredByGroup.reduce(
    (sum, g) => sum + g.phones.length,
    0
  );

  log.set({
    deactivatedCount: toDeactivate.length,
    reactivatedCount: toReactivate.length,
    unregisteredCount: totalUnregistered,
  });

  const hasChanges =
    toDeactivate.length > 0 || toReactivate.length > 0 || totalUnregistered > 0;

  if (hasChanges) {
    const adminIds = await getUserIdsWithPermission("system.alerts");

    try {
      await notifyWhatsAppScanResults({
        userIds: adminIds,
        deactivatedUsers: toDeactivate.map((u) => ({
          name: u.name,
          phone: u.phone,
        })),
        reactivatedUsers: toReactivate.map((u) => ({
          name: u.name,
          phone: u.phone,
        })),
        unregisteredByGroup,
        scannedGroups: groups.map((g) => g.name),
      });
    } catch (error) {
      log.error(error instanceof Error ? error : String(error));
    }
  }

  log.set({ event: "job_complete" });
  log.emit();
}
