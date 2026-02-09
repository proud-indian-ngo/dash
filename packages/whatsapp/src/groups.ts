import { db } from "@pi-dash/db";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { user } from "@pi-dash/db/schema/auth";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { eq } from "drizzle-orm";
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

const ORIENTATION_GROUP_ID = "orientation_group_id";
const ALL_VOLUNTEERS_GROUP_ID = "all_volunteers_group_id";

async function getGroupJidByConfigKey(
  configKey: string
): Promise<string | null> {
  const rows = await db
    .select({ jid: whatsappGroup.jid })
    .from(appConfig)
    .innerJoin(whatsappGroup, eq(whatsappGroup.id, appConfig.value))
    .where(eq(appConfig.key, configKey))
    .limit(1);
  return rows[0]?.jid ?? null;
}

export async function manageOrientationGroupMembership(
  userId: string,
  attendedOrientation: boolean
): Promise<void> {
  const phone = await getUserPhone(userId);
  if (!phone) {
    return;
  }

  if (attendedOrientation) {
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
