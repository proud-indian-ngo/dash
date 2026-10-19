import type { PermissionId } from "@pi-dash/db/permissions";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { authMiddleware } from "@/middleware/auth";

export interface Contact {
  email: string;
  phone: string | null;
}

interface ContactRow extends Contact {
  userId: string;
}

interface ContactSession {
  user: { id: string; role?: null | string };
}

/** The team or event a contact list belongs to, and the team that leads it. */
interface ContactScope {
  managementDomain: null | string;
  teamId: string;
}

export interface ContactsAccess {
  permission: PermissionId;
  /** The Edition workspace owns these lists, so the dashboard hides them. */
  excludeKalakriti?: boolean;
}

export interface ContactsDeps {
  findScope: (scopeId: string) => Promise<ContactScope | undefined>;
  isTeamLead: (teamId: string, userId: string) => Promise<boolean>;
  listContacts: (scopeId: string) => Promise<ContactRow[]>;
  resolvePermissions: (role: string) => Promise<readonly string[]>;
}

/**
 * Contact details of the people on a team's or event's list, for whoever
 * holds the permission or leads the team. Leads rarely hold `users.view`, so
 * the hover card cannot show them, and touch devices have no hover at all.
 */
export async function loadContacts(
  scopeId: string,
  session: ContactSession | null,
  access: ContactsAccess,
  deps: ContactsDeps
): Promise<Record<string, Contact>> {
  if (!session || session.user.role === "external_user") {
    return {};
  }
  const scope = await deps.findScope(scopeId);
  if (
    !scope ||
    (access.excludeKalakriti && scope.managementDomain === "kalakriti")
  ) {
    return {};
  }
  const permissions = await deps.resolvePermissions(
    session.user.role ?? "unoriented_volunteer"
  );
  if (
    !(
      permissions.includes(access.permission) ||
      (await deps.isTeamLead(scope.teamId, session.user.id))
    )
  ) {
    return {};
  }
  const rows = await deps.listContacts(scopeId);
  return Object.fromEntries(
    rows.map((row) => [row.userId, { email: row.email, phone: row.phone }])
  );
}

async function loadDbModules() {
  const [
    { db },
    { resolvePermissions },
    { user },
    { eventInterest },
    { team, teamMember },
    { teamEvent, teamEventMember },
    { and, eq, ne },
  ] = await Promise.all([
    import("@pi-dash/db"),
    import("@pi-dash/db/queries/resolve-permissions"),
    import("@pi-dash/db/schema/auth"),
    import("@pi-dash/db/schema/event-interest"),
    import("@pi-dash/db/schema/team"),
    import("@pi-dash/db/schema/team-event"),
    import("drizzle-orm"),
  ]);
  const findEvent = async (eventId: string) => {
    const [row] = await db
      .select({
        managementDomain: teamEvent.managementDomain,
        teamId: teamEvent.teamId,
      })
      .from(teamEvent)
      .where(eq(teamEvent.id, eventId))
      .limit(1);
    return row;
  };
  const findTeam = async (teamId: string) => {
    const [row] = await db
      .select({ teamId: team.id })
      .from(team)
      .where(eq(team.id, teamId))
      .limit(1);
    return row ? { managementDomain: null, teamId: row.teamId } : undefined;
  };
  const isTeamLead = async (teamId: string, userId: string) => {
    const [row] = await db
      .select({ userId: teamMember.userId })
      .from(teamMember)
      .where(
        and(
          eq(teamMember.teamId, teamId),
          eq(teamMember.userId, userId),
          eq(teamMember.role, "lead")
        )
      )
      .limit(1);
    return row !== undefined;
  };
  const contactColumns = {
    email: user.email,
    phone: user.phone,
    userId: user.id,
  };
  // Like the hover card, never expose external users (Kalakriti) here.
  const internalUser = ne(user.role, "external_user");
  return {
    and,
    contactColumns,
    db,
    eq,
    eventInterest,
    findEvent,
    findTeam,
    internalUser,
    isTeamLead,
    resolvePermissions,
    teamEventMember,
    teamMember,
    user,
  };
}

/** Pending interest requesters, for `events.manage_interest` or a lead. */
export const getEventInterestContacts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1).max(128) }))
  .handler(async ({ context, data }) => {
    const m = await loadDbModules();
    return loadContacts(
      data.eventId,
      context.session,
      { permission: "events.manage_interest" },
      {
        findScope: m.findEvent,
        isTeamLead: m.isTeamLead,
        listContacts: (eventId) =>
          m.db
            .select(m.contactColumns)
            .from(m.eventInterest)
            .innerJoin(m.user, m.eq(m.user.id, m.eventInterest.userId))
            .where(
              m.and(
                m.eq(m.eventInterest.eventId, eventId),
                m.eq(m.eventInterest.status, "pending"),
                m.internalUser
              )
            ),
        resolvePermissions: m.resolvePermissions,
      }
    );
  });

/** Event members, for `events.edit` or a lead: those who manage the list. */
export const getEventMemberContacts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1).max(128) }))
  .handler(async ({ context, data }) => {
    const m = await loadDbModules();
    return loadContacts(
      data.eventId,
      context.session,
      { excludeKalakriti: true, permission: "events.edit" },
      {
        findScope: m.findEvent,
        isTeamLead: m.isTeamLead,
        listContacts: (eventId) =>
          m.db
            .select(m.contactColumns)
            .from(m.teamEventMember)
            .innerJoin(m.user, m.eq(m.user.id, m.teamEventMember.userId))
            .where(
              m.and(m.eq(m.teamEventMember.eventId, eventId), m.internalUser)
            ),
        resolvePermissions: m.resolvePermissions,
      }
    );
  });

/** Team members, for `teams.manage_members` or a lead of the team. */
export const getTeamMemberContacts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ teamId: z.string().min(1).max(128) }))
  .handler(async ({ context, data }) => {
    const m = await loadDbModules();
    return loadContacts(
      data.teamId,
      context.session,
      { permission: "teams.manage_members" },
      {
        findScope: m.findTeam,
        isTeamLead: m.isTeamLead,
        listContacts: (teamId) =>
          m.db
            .select(m.contactColumns)
            .from(m.teamMember)
            .innerJoin(m.user, m.eq(m.user.id, m.teamMember.userId))
            .where(m.and(m.eq(m.teamMember.teamId, teamId), m.internalUser)),
        resolvePermissions: m.resolvePermissions,
      }
    );
  });
