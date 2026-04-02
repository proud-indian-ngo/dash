import { db } from "@pi-dash/db";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { user } from "@pi-dash/db/schema/auth";
import { team } from "@pi-dash/db/schema/team";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { eq, inArray, sql } from "drizzle-orm";
import { getWhatsAppApiUrl, getWhatsAppHeaders } from "./client";
import { formatPhoneForWhatsApp } from "./phone";

export async function getUserPhone(userId: string): Promise<string | null> {
  const rows = await db
    .select({ phone: user.phone })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0]?.phone ?? null;
}

export async function getUserPhones(
  userIds: string[]
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ id: user.id, phone: user.phone })
    .from(user)
    .where(inArray(user.id, userIds));
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.phone) {
      map.set(row.id, row.phone);
    }
  }
  return map;
}

export async function addToWhatsAppGroup(
  groupJid: string,
  phone: string
): Promise<void> {
  const apiUrl = getWhatsAppApiUrl();
  if (!apiUrl) {
    return;
  }

  const formatted = formatPhoneForWhatsApp(phone);
  const response = await fetch(`${apiUrl}/group/participants`, {
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({
      group_id: groupJid,
      participants: [formatted],
    }),
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
    return;
  }

  const response = await fetch(`${apiUrl}/group/participants`, {
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({
      group_id: groupJid,
      participants: phones.map(formatPhoneForWhatsApp),
    }),
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
    return;
  }

  const formatted = formatPhoneForWhatsApp(phone);
  const response = await fetch(`${apiUrl}/group/participants/remove`, {
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({
      group_id: groupJid,
      participants: [formatted],
    }),
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
    return [];
  }

  const response = await fetch(`${apiUrl}/user/my/groups`, {
    method: "GET",
    headers: getWhatsAppHeaders(),
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
    method: "POST",
    headers: getWhatsAppHeaders(),
    body: JSON.stringify({
      title: name,
      participants: participants.map(formatPhoneForWhatsApp),
    }),
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

const ORIENTATION_GROUP_ID = "orientation_group_id";
const ALL_VOLUNTEERS_GROUP_ID = "all_volunteers_group_id";

async function getGroupJidByConfigKey(
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
  isOriented: boolean
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
      await addToWhatsAppGroup(allVolunteersJid, phone);
    }
    const orientationJid = await getGroupJidByConfigKey(ORIENTATION_GROUP_ID);
    if (orientationJid) {
      await removeFromWhatsAppGroup(orientationJid, phone);
    }
  } else {
    const orientationJid = await getGroupJidByConfigKey(ORIENTATION_GROUP_ID);
    if (orientationJid) {
      await addToWhatsAppGroup(orientationJid, phone);
    }
  }
}
