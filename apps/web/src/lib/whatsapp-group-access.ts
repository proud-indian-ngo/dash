import { isOrientedRole } from "@pi-dash/auth/reactivation";
import { db } from "@pi-dash/db";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { user } from "@pi-dash/db/schema/auth";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { and, eq, inArray } from "drizzle-orm";

export const ORIENTATION_GROUP_CONFIG_KEY = "orientation_group_id";
export const ALL_VOLUNTEERS_GROUP_CONFIG_KEY = "all_volunteers_group_id";

/** What pi-dash knows about a group and the person asking to join it. */
export interface WhatsAppGroupAccessFacts {
  /** app_config keys whose value is this group. */
  configKeys: string[];
  /** Events using this group, and whether the person is a member of each. */
  events: { id: string; isMember: boolean; isSeriesException: boolean }[];
  group: { jid: string; name: string } | null;
  /** Teams using this group, and whether the person is a member of each. */
  teams: { id: string; isMember: boolean }[];
  userRole: string | null;
}

export type WhatsAppGroupAccess =
  | { backPath: string | null; jid: string; name: string; status: "allowed" }
  | { backPath: string | null; status: "not_member" }
  | { backPath: null; status: "not_found" };

function firstBackPath(facts: WhatsAppGroupAccessFacts): string | null {
  const [firstTeam] = facts.teams;
  if (firstTeam) {
    return `/teams/${firstTeam.id}`;
  }
  const event =
    facts.events.find((row) => !row.isSeriesException) ?? facts.events[0];
  return event ? `/events/${event.id}` : null;
}

/**
 * Whether the person is entitled to the group right now: a member of the
 * team or event using it, or (for the two app-wide groups) oriented for the
 * all-volunteers group and not yet oriented for the orientation group.
 */
export function decideWhatsAppGroupAccess(
  facts: WhatsAppGroupAccessFacts
): WhatsAppGroupAccess {
  const { group } = facts;
  if (!group) {
    return { backPath: null, status: "not_found" };
  }
  const allowed = (backPath: string | null): WhatsAppGroupAccess => ({
    backPath,
    jid: group.jid,
    name: group.name,
    status: "allowed",
  });

  const memberTeam = facts.teams.find((row) => row.isMember);
  if (memberTeam) {
    return allowed(`/teams/${memberTeam.id}`);
  }
  const memberEvent = facts.events.find((row) => row.isMember);
  if (memberEvent) {
    return allowed(`/events/${memberEvent.id}`);
  }
  const oriented = isOrientedRole(facts.userRole);
  if (
    (oriented && facts.configKeys.includes(ALL_VOLUNTEERS_GROUP_CONFIG_KEY)) ||
    (!oriented && facts.configKeys.includes(ORIENTATION_GROUP_CONFIG_KEY))
  ) {
    return allowed(null);
  }
  return { backPath: firstBackPath(facts), status: "not_member" };
}

export async function loadWhatsAppGroupAccessFacts(
  groupId: string,
  userId: string
): Promise<WhatsAppGroupAccessFacts> {
  const [group] = await db
    .select({ jid: whatsappGroup.jid, name: whatsappGroup.name })
    .from(whatsappGroup)
    .where(eq(whatsappGroup.id, groupId))
    .limit(1);
  if (!group) {
    return {
      configKeys: [],
      events: [],
      group: null,
      teams: [],
      userRole: null,
    };
  }

  const [teams, events, configRows, userRows] = await Promise.all([
    db
      .select({ id: team.id, memberId: teamMember.id })
      .from(team)
      .leftJoin(
        teamMember,
        and(eq(teamMember.teamId, team.id), eq(teamMember.userId, userId))
      )
      .where(eq(team.whatsappGroupId, groupId)),
    db
      .select({
        id: teamEvent.id,
        memberId: teamEventMember.id,
        seriesId: teamEvent.seriesId,
      })
      .from(teamEvent)
      .leftJoin(
        teamEventMember,
        and(
          eq(teamEventMember.eventId, teamEvent.id),
          eq(teamEventMember.userId, userId)
        )
      )
      .where(eq(teamEvent.whatsappGroupId, groupId)),
    db
      .select({ key: appConfig.key })
      .from(appConfig)
      .where(
        and(
          inArray(appConfig.key, [
            ORIENTATION_GROUP_CONFIG_KEY,
            ALL_VOLUNTEERS_GROUP_CONFIG_KEY,
          ]),
          eq(appConfig.value, groupId)
        )
      ),
    db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
  ]);

  return {
    configKeys: configRows.map((row) => row.key),
    events: events.map((row) => ({
      id: row.id,
      isMember: row.memberId !== null,
      isSeriesException: row.seriesId !== null,
    })),
    group,
    teams: teams.map((row) => ({
      id: row.id,
      isMember: row.memberId !== null,
    })),
    userRole: userRows[0]?.role ?? null,
  };
}

export async function resolveWhatsAppGroupAccess(
  groupId: string,
  userId: string,
  loadFacts: typeof loadWhatsAppGroupAccessFacts = loadWhatsAppGroupAccessFacts
): Promise<WhatsAppGroupAccess> {
  return decideWhatsAppGroupAccess(await loadFacts(groupId, userId));
}
