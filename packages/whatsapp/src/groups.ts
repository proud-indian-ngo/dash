import { db } from "@pi-dash/db";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { user } from "@pi-dash/db/schema/auth";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { eq, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";

import { getWhatsAppApiUrl, getWhatsAppHeaders } from "./client";
import { isCloudApiEnabled } from "./cloud";
import { sendWhatsAppNotification } from "./notify";
import { formatPhoneForWhatsApp } from "./phone";
import { getEnabledUserPhonesForTopic } from "./preferences";
import { whatsappTemplate } from "./template-message";
import { getUserPhone } from "./users";

const WHATSAPP_JID_SUFFIX = /@s\.whatsapp\.net$/;

export async function addToWhatsAppGroup(
  groupJid: string,
  phone: string
): Promise<void> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    const log = createRequestLogger({
      method: "POST",
      path: "addToWhatsAppGroup",
    });
    log.set({ groupJid, phone });
    log.warn("whatsapp_not_configured");
    log.emit();
    return;
  }

  const formatted = formatPhoneForWhatsApp(phone);
  const response = await fetch(`${apiUrl}/group/participants`, {
    body: JSON.stringify({
      group_id: groupJid,
      participants: [formatted],
    }),
    headers: getWhatsAppHeaders(),
    method: "POST",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp group add error ${response.status}: ${text}`);
  }
}

export async function addUsersToWhatsAppGroup(
  groupJid: string,
  phones: string[]
): Promise<void> {
  if (phones.length === 0) {
    return;
  }
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    const log = createRequestLogger({
      method: "POST",
      path: "addUsersToWhatsAppGroup",
    });
    log.set({ groupJid, phoneCount: phones.length });
    log.warn("whatsapp_not_configured");
    log.emit();
    return;
  }

  const response = await fetch(`${apiUrl}/group/participants`, {
    body: JSON.stringify({
      group_id: groupJid,
      participants: phones.map(formatPhoneForWhatsApp),
    }),
    headers: getWhatsAppHeaders(),
    method: "POST",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp group add error ${response.status}: ${text}`);
  }
}

export async function removeFromWhatsAppGroup(
  groupJid: string,
  phone: string
): Promise<void> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    const log = createRequestLogger({
      method: "POST",
      path: "removeFromWhatsAppGroup",
    });
    log.set({ groupJid, phone });
    log.warn("whatsapp_not_configured");
    log.emit();
    return;
  }

  const formatted = formatPhoneForWhatsApp(phone);
  const response = await fetch(`${apiUrl}/group/participants/remove`, {
    body: JSON.stringify({
      group_id: groupJid,
      participants: [formatted],
    }),
    headers: getWhatsAppHeaders(),
    method: "POST",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp group remove error ${response.status}: ${text}`);
  }
}

export function isWhatsAppConfigured(): boolean {
  return !!getWhatsAppApiUrl();
}

export async function listJoinedGroups(): Promise<
  { jid: string; name: string; participantCount: number }[]
> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    const log = createRequestLogger({
      method: "GET",
      path: "listJoinedGroups",
    });
    log.warn("whatsapp_not_configured");
    log.emit();
    return [];
  }

  const response = await fetch(`${apiUrl}/user/my/groups`, {
    headers: getWhatsAppHeaders(),
    method: "GET",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp list groups error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    results?: {
      data?: Array<{
        JID?: string;
        Name?: string;
        Participants?: unknown[];
      }>;
    };
  };

  const groups = data.results?.data ?? [];
  return groups.map((g) => ({
    jid: g.JID ?? "",
    name: g.Name ?? "",
    participantCount: g.Participants?.length ?? 0,
  }));
}

export async function createWhatsAppGroup(
  name: string,
  participants: string[] = []
): Promise<{ jid: string }> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    throw new Error("WhatsApp API URL is not configured");
  }

  const response = await fetch(`${apiUrl}/group`, {
    body: JSON.stringify({
      participants: participants.map(formatPhoneForWhatsApp),
      title: name,
    }),
    headers: getWhatsAppHeaders(),
    method: "POST",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp group create error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    results?: { group_id?: string };
  };
  const groupId = data.results?.group_id;
  if (!groupId) {
    throw new Error("Invalid WhatsApp API response: missing group_id");
  }
  return { jid: groupId };
}

export async function getGroupParticipants(
  groupJid: string
): Promise<string[]> {
  const log = createRequestLogger({
    method: "GET",
    path: "getGroupParticipants",
  });
  log.set({ groupJid });

  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    log.warn("whatsapp_not_configured");
    log.emit();
    return [];
  }

  const url = new URL(`${apiUrl}/group/info`);
  url.searchParams.set("group_id", groupJid);

  const response = await fetch(url.toString(), {
    headers: getWhatsAppHeaders(),
    method: "GET",
  });

  if (!response.ok) {
    const text = await response.text();
    log.error(
      new Error(`WhatsApp group participants error ${response.status}: ${text}`)
    );
    log.emit();
    throw new Error(
      `WhatsApp group participants error ${response.status}: ${text}`
    );
  }

  const data = (await response.json()) as {
    results?: {
      Participants?: Array<{ PhoneNumber?: string }>;
    };
  };

  const participants = data.results?.Participants ?? [];
  const phones = participants
    .filter((p) => (p.PhoneNumber ?? "").endsWith("@s.whatsapp.net"))
    .map((p) => (p.PhoneNumber ?? "").replace(WHATSAPP_JID_SUFFIX, ""))
    .filter(Boolean);

  log.set({
    event: "participants_fetched",
    skippedNonWhatsApp: participants.length - phones.length,
    totalParticipants: participants.length,
    validPhones: phones.length,
  });
  log.emit();

  return phones;
}

const ORIENTATION_GROUP_ID = "orientation_group_id";
const ALL_VOLUNTEERS_GROUP_ID = "all_volunteers_group_id";

export async function getGroupJidByConfigKey(
  configKey: string
): Promise<string | null> {
  const rows = await db
    .select({ jid: whatsappGroup.jid })
    .from(appConfig)
    .innerJoin(
      whatsappGroup,
      eq(whatsappGroup.id, sql`${appConfig.value}::uuid`)
    )
    .where(eq(appConfig.key, configKey))
    .limit(1);
  return rows[0]?.jid ?? null;
}

export async function getGroupInfoByConfigKey(
  configKey: string
): Promise<{ jid: string; name: string } | null> {
  const rows = await db
    .select({ jid: whatsappGroup.jid, name: whatsappGroup.name })
    .from(appConfig)
    .innerJoin(
      whatsappGroup,
      eq(whatsappGroup.id, sql`${appConfig.value}::uuid`)
    )
    .where(eq(appConfig.key, configKey))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTeamWhatsAppGroupJid(
  teamId: string
): Promise<string | null> {
  const rows = await db
    .select({ jid: whatsappGroup.jid })
    .from(team)
    .innerJoin(whatsappGroup, eq(whatsappGroup.id, team.whatsappGroupId))
    .where(eq(team.id, teamId))
    .limit(1);
  return rows[0]?.jid ?? null;
}

export async function manageOrientationGroupMembership(
  userId: string,
  isOriented: boolean,
  joinBy?: Date
): Promise<void> {
  const phone = await getUserPhone(userId);
  if (!phone) {
    return;
  }

  if (isOriented) {
    const allVolunteersJid = await getGroupJidByConfigKey(
      ALL_VOLUNTEERS_GROUP_ID
    );
    if (allVolunteersJid) {
      await addOrInviteToWhatsAppGroup(allVolunteersJid, phone, userId, joinBy);
    }
    // A reminder goes only to people in neither group
    const orientationJid = joinBy
      ? null
      : await getGroupJidByConfigKey(ORIENTATION_GROUP_ID);
    if (orientationJid) {
      await removeFromWhatsAppGroup(orientationJid, phone);
    }
  } else {
    const orientationJid = await getGroupJidByConfigKey(ORIENTATION_GROUP_ID);
    if (orientationJid) {
      await addOrInviteToWhatsAppGroup(orientationJid, phone, userId, joinBy);
    }
  }
}

export async function getAllGroupJidsForUser(
  userId: string
): Promise<string[]> {
  // Team groups
  const teamGroups = await db
    .select({ jid: whatsappGroup.jid })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .innerJoin(whatsappGroup, eq(whatsappGroup.id, team.whatsappGroupId))
    .where(eq(teamMember.userId, userId));

  // Event groups
  const eventGroups = await db
    .select({ jid: whatsappGroup.jid })
    .from(teamEventMember)
    .innerJoin(teamEvent, eq(teamEvent.id, teamEventMember.eventId))
    .innerJoin(whatsappGroup, eq(whatsappGroup.id, teamEvent.whatsappGroupId))
    .where(eq(teamEventMember.userId, userId));

  // Orientation or all-volunteers group based on role
  const userRow = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const role = userRow[0]?.role;

  const configKey =
    role === "unoriented_volunteer"
      ? ORIENTATION_GROUP_ID
      : ALL_VOLUNTEERS_GROUP_ID;
  const configJid = await getGroupJidByConfigKey(configKey);

  const jids = new Set<string>();
  for (const row of teamGroups) {
    jids.add(row.jid);
  }
  for (const row of eventGroups) {
    jids.add(row.jid);
  }
  if (configJid) {
    jids.add(configJid);
  }

  return [...jids];
}

/** The group's invite link from GoWA, or null when it can't be had. */
export async function getWhatsAppGroupInviteLink(
  groupJid: string
): Promise<string | null> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    return null;
  }
  const url = new URL(`${apiUrl}/group/invite-link`);
  url.searchParams.set("group_id", groupJid);
  const response = await fetch(url.toString(), {
    headers: getWhatsAppHeaders(),
    method: "GET",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `WhatsApp group invite link error ${response.status}: ${text}`
    );
  }
  const data = (await response.json()) as {
    results?: { invite_link?: string };
  };
  const link = data.results?.invite_link;
  return link?.startsWith("https://chat.whatsapp.com/") ? link : null;
}

/** WhatsApp topic settings that decide who gets a group invite. */
const TEAMS_TOPIC = "Teams";
const EVENTS_TOPIC = "Events - Schedule";

/**
 * How the invite names what the person joined: the team or event the group
 * belongs to, else the dashboard (the all-volunteers and orientation groups).
 * The topic is the WhatsApp setting someone turns off to stop invites.
 */
async function describeGroup(
  groupId: string
): Promise<{ joined: string; topic: string }> {
  const [teamRow] = await db
    .select({ name: team.name })
    .from(team)
    .where(eq(team.whatsappGroupId, groupId))
    .limit(1);
  if (teamRow) {
    return { joined: `the team ${teamRow.name}`, topic: TEAMS_TOPIC };
  }
  const [eventRow] = await db
    .select({ name: teamEvent.name })
    .from(teamEvent)
    .where(eq(teamEvent.whatsappGroupId, groupId))
    .limit(1);
  if (eventRow) {
    return { joined: `the event ${eventRow.name}`, topic: EVENTS_TOPIC };
  }
  return { joined: "Proud Indian Dashboard", topic: EVENTS_TOPIC };
}

const joinByDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
  weekday: "short",
});

const indiaDate = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Kolkata",
  year: "numeric",
});

export interface GroupInviteResult {
  alreadyMember: number;
  invited: number;
  /** No phone, or WhatsApp turned off for the group's topic. */
  optedOut: number;
  rejected: number;
}

/**
 * Send the group invite template instead of adding people. Adding people
 * who haven't saved the number is a strong ban signal for the GoWA number,
 * so with the Cloud API on, people join through the invite link themselves.
 * Skips people already in the group and people who turned WhatsApp off for
 * the group's topic; one invite per group per person per day. Each person
 * is tried on their own; a transient failure is rethrown at the end so the
 * job retries (people already invited are skipped then).
 * With `joinBy`, it sends the reminder that names the date the weekly scan
 * may deactivate them instead.
 */
export async function inviteToWhatsAppGroup(
  groupJid: string,
  userIds: string[],
  joinBy?: Date
): Promise<GroupInviteResult> {
  const result: GroupInviteResult = {
    alreadyMember: 0,
    invited: 0,
    optedOut: 0,
    rejected: 0,
  };
  const [group] = await db
    .select({ id: whatsappGroup.id, name: whatsappGroup.name })
    .from(whatsappGroup)
    .where(eq(whatsappGroup.jid, groupJid))
    .limit(1);
  if (!group || userIds.length === 0) {
    return result;
  }
  const { joined, topic } = await describeGroup(group.id);
  const phones = await getEnabledUserPhonesForTopic(userIds, topic);
  result.optedOut = userIds.length - phones.size;
  if (phones.size === 0) {
    return result;
  }
  const participants = new Set(await getGroupParticipants(groupJid));
  const joinPath = `/whatsapp-groups/${group.id}/join`;
  const template = joinBy
    ? whatsappTemplate(
        "group_join_reminder",
        { date: joinByDate.format(joinBy), group: group.name },
        joinPath
      )
    : whatsappTemplate("group_invite", { group: group.name, joined }, joinPath);
  const keyPrefix = joinBy ? "group-join-reminder" : "group-invite";
  const day = indiaDate.format(new Date());
  let transient: unknown;
  for (const [userId, phone] of phones) {
    if (participants.has(formatPhoneForWhatsApp(phone))) {
      result.alreadyMember += 1;
      continue;
    }
    try {
      const outcome = await sendWhatsAppNotification(
        phone,
        { template, text: "" },
        { idempotencyKey: `${keyPrefix}-${group.id}-${userId}-${day}`, userId }
      );
      if (outcome === "sent" || outcome === "duplicate") {
        result.invited += 1;
      } else {
        result.rejected += 1;
      }
    } catch (error) {
      transient ??= error;
      const log = createRequestLogger({
        method: "POST",
        path: "inviteToWhatsAppGroup",
      });
      log.set({ groupId: group.id, userId });
      log.error(error instanceof Error ? error : String(error));
      log.emit();
    }
  }
  if (transient) {
    throw transient;
  }
  return result;
}

/**
 * Invite through the Cloud API when it's on; otherwise add through GoWA.
 * A reminder (`joinBy`) is Cloud API only: re-adding people every week, some
 * of whom left on purpose, would be a ban signal for the GoWA number.
 */
export async function addOrInviteToWhatsAppGroup(
  groupJid: string,
  phone: string,
  userId: string,
  joinBy?: Date
): Promise<void> {
  if (isCloudApiEnabled()) {
    await inviteToWhatsAppGroup(groupJid, [userId], joinBy);
    return;
  }
  if (!joinBy) {
    await addToWhatsAppGroup(groupJid, phone);
  }
}
