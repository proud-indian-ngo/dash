import { db } from "@pi-dash/db";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { team } from "@pi-dash/db/schema/team";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { eq, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { getWhatsAppApiUrl, getWhatsAppHeaders } from "./client";
import { formatPhoneForWhatsApp } from "./phone";
import { getUserPhone } from "./users";

const WHATSAPP_JID_SUFFIX = /@s\.whatsapp\.net$/;

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
    log.set({ event: "whatsapp_not_configured" });
    log.emit();
    return [];
  }

  const url = new URL(`${apiUrl}/group/info`);
  url.searchParams.set("group_id", groupJid);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: getWhatsAppHeaders(),
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
    totalParticipants: participants.length,
    validPhones: phones.length,
    skippedNonWhatsApp: participants.length - phones.length,
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
