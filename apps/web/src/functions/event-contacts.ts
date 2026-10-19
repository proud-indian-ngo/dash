import type { PermissionId } from "@pi-dash/db/permissions";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { authMiddleware } from "@/middleware/auth";

export interface EventContact {
  email: string;
  phone: string | null;
}

interface EventContactRow extends EventContact {
  userId: string;
}

interface EventContactSession {
  user: { id: string; role?: null | string };
}

interface ContactEvent {
  managementDomain: null | string;
  teamId: string;
}

export interface EventContactsAccess {
  permission: PermissionId;
  /** The Edition workspace owns these lists, so the dashboard hides them. */
  excludeKalakritiEvents?: boolean;
}

export interface EventContactsDeps {
  findEvent: (eventId: string) => Promise<ContactEvent | undefined>;
  isTeamLead: (teamId: string, userId: string) => Promise<boolean>;
  listContacts: (eventId: string) => Promise<EventContactRow[]>;
  resolvePermissions: (role: string) => Promise<readonly string[]>;
}

/**
 * Contact details of the people an event's reviewer or manager deals with,
 * for whoever holds the permission or leads the event's team. Leads rarely hold
 * `users.view`, so the hover card cannot show them, and touch devices have no
 * hover at all.
 */
export async function loadEventContacts(
  eventId: string,
  session: EventContactSession | null,
  access: EventContactsAccess,
  deps: EventContactsDeps
): Promise<Record<string, EventContact>> {
  if (!session || session.user.role === "external_user") {
    return {};
  }
  const event = await deps.findEvent(eventId);
  if (
    !event ||
    (access.excludeKalakritiEvents && event.managementDomain === "kalakriti")
  ) {
    return {};
  }
  const permissions = await deps.resolvePermissions(
    session.user.role ?? "unoriented_volunteer"
  );
  if (
    !(
      permissions.includes(access.permission) ||
      (await deps.isTeamLead(event.teamId, session.user.id))
    )
  ) {
    return {};
  }
  const rows = await deps.listContacts(eventId);
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
    { teamMember },
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
  const accessDeps = {
    findEvent: async (eventId: string) => {
      const [row] = await db
        .select({
          managementDomain: teamEvent.managementDomain,
          teamId: teamEvent.teamId,
        })
        .from(teamEvent)
        .where(eq(teamEvent.id, eventId))
        .limit(1);
      return row;
    },
    isTeamLead: async (teamId: string, userId: string) => {
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
    },
    resolvePermissions,
  };
  const contactColumns = {
    email: user.email,
    phone: user.phone,
    userId: user.id,
  };
  // Like the hover card, never expose external users (Kalakriti) here.
  const internalUser = ne(user.role, "external_user");
  return {
    accessDeps,
    and,
    contactColumns,
    db,
    eq,
    eventInterest,
    internalUser,
    teamEventMember,
    user,
  };
}

/** Pending interest requesters, for `events.manage_interest` or a lead. */
export const getEventInterestContacts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1).max(128) }))
  .handler(async ({ context, data }) => {
    const {
      accessDeps,
      and,
      contactColumns,
      db,
      eq,
      eventInterest,
      internalUser,
      user,
    } = await loadDbModules();
    return loadEventContacts(
      data.eventId,
      context.session,
      { permission: "events.manage_interest" },
      {
        ...accessDeps,
        listContacts: (eventId) =>
          db
            .select(contactColumns)
            .from(eventInterest)
            .innerJoin(user, eq(user.id, eventInterest.userId))
            .where(
              and(
                eq(eventInterest.eventId, eventId),
                eq(eventInterest.status, "pending"),
                internalUser
              )
            ),
      }
    );
  });

/** Event members, for `events.edit` or a lead: those who manage the list. */
export const getEventMemberContacts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1).max(128) }))
  .handler(async ({ context, data }) => {
    const {
      accessDeps,
      and,
      contactColumns,
      db,
      eq,
      internalUser,
      teamEventMember,
      user,
    } = await loadDbModules();
    return loadEventContacts(
      data.eventId,
      context.session,
      { excludeKalakritiEvents: true, permission: "events.edit" },
      {
        ...accessDeps,
        listContacts: (eventId) =>
          db
            .select(contactColumns)
            .from(teamEventMember)
            .innerJoin(user, eq(user.id, teamEventMember.userId))
            .where(and(eq(teamEventMember.eventId, eventId), internalUser)),
      }
    );
  });
