import {
  issueRegisterEventInvite,
  revokeRegisterEventInvites,
} from "@pi-dash/auth/register-event-invite-db";
import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { kalakritiEdition } from "@pi-dash/db/schema/kalakriti";
import { teamMember } from "@pi-dash/db/schema/team";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { and, eq } from "drizzle-orm";

import { HttpError } from "@/lib/http-error";
import { canManageKalakritiVolunteers } from "@/lib/kalakriti-volunteer-policy";
import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";

interface SignupLinkSession {
  user: { id: string; role?: string | null };
}

interface SignupLinkEvent {
  cancelledAt: Date | null;
  managementDomain: string | null;
  startTime: Date;
  teamId: string;
}

interface SignupLinkEdition {
  lifecycle: string;
  year: number;
}

export interface EventSignupLinkDeps {
  canManageEditionVolunteers: (
    session: SignupLinkSession,
    year: number
  ) => Promise<boolean>;
  findEdition: (eventId: string) => Promise<SignupLinkEdition | null>;
  findEvent: (eventId: string) => Promise<SignupLinkEvent | null>;
  isTeamLead: (teamId: string, userId: string) => Promise<boolean>;
  issue: typeof issueRegisterEventInvite;
  resolvePermissions: (role: string) => Promise<readonly string[]>;
  revoke: typeof revokeRegisterEventInvites;
}

/**
 * Who manages an event's sign-up link: whoever adds its members. That is
 * `events.manage_members` or a lead of the event's team, or for a
 * Kalakriti-linked event whoever manages the Edition's volunteer roster.
 */
async function assertCanManageSignupLink(
  session: SignupLinkSession,
  eventId: string,
  deps: EventSignupLinkDeps
): Promise<SignupLinkEvent> {
  const event = await deps.findEvent(eventId);
  if (!event) {
    throw new HttpError(404, "Event not found");
  }
  const edition = await deps.findEdition(eventId);
  if (edition || event.managementDomain === "kalakriti") {
    if (
      !(
        edition &&
        (await deps.canManageEditionVolunteers(session, edition.year))
      )
    ) {
      throw new HttpError(403, "Forbidden");
    }
    if (edition.lifecycle === "archived") {
      throw new HttpError(409, "This Kalakriti Edition is archived");
    }
    return event;
  }
  const permissions = await deps.resolvePermissions(
    session.user.role ?? "unoriented_volunteer"
  );
  if (
    !(
      permissions.includes("events.manage_members") ||
      (await deps.isTeamLead(event.teamId, session.user.id))
    )
  ) {
    throw new HttpError(403, "Forbidden");
  }
  return event;
}

/** Replace the event's sign-up link; it stops working when the event starts. */
export async function createEventSignupLinkWithDeps(
  session: SignupLinkSession,
  eventId: string,
  now: number,
  deps: EventSignupLinkDeps
): Promise<{ expiresAt: number; token: string }> {
  const event = await assertCanManageSignupLink(session, eventId, deps);
  if (event.cancelledAt || event.startTime.getTime() <= now) {
    throw new HttpError(409, "Sign-up links are only for upcoming events");
  }
  const token = await deps.issue({
    eventId,
    expiresAt: event.startTime,
    issuedBy: session.user.id,
  });
  return { expiresAt: event.startTime.getTime(), token };
}

export async function turnOffEventSignupLinkWithDeps(
  session: SignupLinkSession,
  eventId: string,
  deps: EventSignupLinkDeps
): Promise<void> {
  await assertCanManageSignupLink(session, eventId, deps);
  await deps.revoke(eventId);
}

export const eventSignupLinkDeps: EventSignupLinkDeps = {
  canManageEditionVolunteers: async (session, year) => {
    const access = await resolveKalakritiEditionAccess({
      role: session.user.role ?? "unoriented_volunteer",
      userId: session.user.id,
      year,
    });
    return access ? canManageKalakritiVolunteers(access) : false;
  },
  findEdition: async (eventId) => {
    const [row] = await db
      .select({
        lifecycle: kalakritiEdition.lifecycle,
        year: kalakritiEdition.year,
      })
      .from(kalakritiEdition)
      .where(eq(kalakritiEdition.teamEventId, eventId))
      .limit(1);
    return row ?? null;
  },
  findEvent: async (eventId) => {
    const [row] = await db
      .select({
        cancelledAt: teamEvent.cancelledAt,
        managementDomain: teamEvent.managementDomain,
        startTime: teamEvent.startTime,
        teamId: teamEvent.teamId,
      })
      .from(teamEvent)
      .where(eq(teamEvent.id, eventId))
      .limit(1);
    return row
      ? { ...row, managementDomain: row.managementDomain ?? null }
      : null;
  },
  isTeamLead: async (teamId, userId) => {
    const [row] = await db
      .select({ id: teamMember.id })
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
  issue: issueRegisterEventInvite,
  resolvePermissions,
  revoke: revokeRegisterEventInvites,
};
