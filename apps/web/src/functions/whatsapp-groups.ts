import {
  getWhatsAppGroupInviteLink,
  isWhatsAppConfigured,
  listJoinedGroups,
} from "@pi-dash/whatsapp/groups";
import { createServerFn } from "@tanstack/react-start";
import { createRequestLogger } from "evlog";
import * as z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { resolveWhatsAppGroupAccess } from "@/lib/whatsapp-group-access";
import { authMiddleware } from "@/middleware/auth";

export const checkWhatsAppConfiguration = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await assertServerPermission(context.session, "settings.whatsapp_groups");
    return { configured: isWhatsAppConfigured() };
  });

export const fetchWhatsAppGroups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await assertServerPermission(context.session, "settings.whatsapp_groups");

    if (!isWhatsAppConfigured()) {
      return { configured: false as const, groups: [] };
    }

    const log = createRequestLogger({
      method: "GET",
      path: "/whatsapp-groups",
    });
    log.set({
      handler: "fetchWhatsAppGroups",
      userId: context.session?.user.id,
    });

    try {
      const groups = await listJoinedGroups();
      log.set({ groupCount: groups.length });
      log.emit();
      return { configured: true as const, groups };
    } catch (error) {
      log.error(error instanceof Error ? error : String(error));
      log.emit();
      throw error;
    }
  });

export type WhatsAppGroupJoinLink =
  | {
      backPath: string | null;
      name: string;
      reason: null;
      url: string;
    }
  | {
      backPath: string | null;
      name: string | null;
      reason: "not_found" | "not_member" | "unavailable";
      url: null;
    };

/**
 * The invite link behind the "Join group" button in WhatsApp group invites.
 * Only people currently entitled to the group get it: members of the team
 * or event using it, oriented people for the all-volunteers group, and
 * people not yet oriented for the orientation group. Invites outlive
 * membership, so the button alone proves nothing.
 */
export const getWhatsAppGroupJoinLink = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ groupId: z.uuid() }))
  .handler(async ({ context, data }): Promise<WhatsAppGroupJoinLink> => {
    const log = createRequestLogger({
      method: "GET",
      path: "/whatsapp-groups/join",
    });
    const userId = context.session?.user.id;
    log.set({
      groupId: data.groupId,
      handler: "getWhatsAppGroupJoinLink",
      userId,
    });
    if (!userId) {
      log.set({ event: "not_signed_in" });
      log.emit();
      return { backPath: null, name: null, reason: "not_member", url: null };
    }
    const access = await resolveWhatsAppGroupAccess(data.groupId, userId);
    if (access.status === "not_found") {
      log.set({ event: "group_not_found" });
      log.emit();
      return { backPath: null, name: null, reason: "not_found", url: null };
    }
    if (access.status === "not_member") {
      // No group name: it isn't theirs to see.
      log.set({ event: "not_entitled" });
      log.emit();
      return {
        backPath: access.backPath,
        name: null,
        reason: "not_member",
        url: null,
      };
    }
    const unavailable = {
      backPath: access.backPath,
      name: access.name,
      reason: "unavailable",
      url: null,
    } as const;
    try {
      const url = await getWhatsAppGroupInviteLink(access.jid);
      log.set({ event: url ? "invite_link_found" : "invite_link_missing" });
      log.emit();
      return url
        ? { backPath: access.backPath, name: access.name, reason: null, url }
        : unavailable;
    } catch (error) {
      log.error(error instanceof Error ? error : String(error));
      log.emit();
      return unavailable;
    }
  });
