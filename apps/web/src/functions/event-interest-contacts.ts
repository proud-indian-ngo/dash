import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { authMiddleware } from "@/middleware/auth";

export interface InterestContact {
  email: string;
  phone: string | null;
}

interface InterestContactRow extends InterestContact {
  userId: string;
}

interface InterestContactSession {
  user: { id: string; role?: null | string };
}

export interface InterestContactsDeps {
  findEventTeamId: (eventId: string) => Promise<string | undefined>;
  isTeamLead: (teamId: string, userId: string) => Promise<boolean>;
  listPendingContacts: (eventId: string) => Promise<InterestContactRow[]>;
  resolvePermissions: (role: string) => Promise<readonly string[]>;
}

/**
 * Contact details of the people with a pending interest request on an event,
 * for whoever may review those requests: `events.manage_interest` or a lead
 * of the event's team. Leads rarely hold `users.view`, so the hover card
 * cannot show them, and touch devices have no hover at all.
 */
export async function loadEventInterestContacts(
  eventId: string,
  session: InterestContactSession | null,
  deps: InterestContactsDeps
): Promise<Record<string, InterestContact>> {
  if (!session || session.user.role === "external_user") {
    return {};
  }
  const permissions = await deps.resolvePermissions(
    session.user.role ?? "unoriented_volunteer"
  );
  if (!permissions.includes("events.manage_interest")) {
    const teamId = await deps.findEventTeamId(eventId);
    if (!(teamId && (await deps.isTeamLead(teamId, session.user.id)))) {
      return {};
    }
  }
  const rows = await deps.listPendingContacts(eventId);
  return Object.fromEntries(
    rows.map((row) => [row.userId, { email: row.email, phone: row.phone }])
  );
}

export const getEventInterestContacts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1).max(128) }))
  .handler(async ({ context, data }) => {
    const [
      { db },
      { resolvePermissions },
      { user },
      { eventInterest },
      { teamMember },
      { teamEvent },
      { and, eq },
    ] = await Promise.all([
      import("@pi-dash/db"),
      import("@pi-dash/db/queries/resolve-permissions"),
      import("@pi-dash/db/schema/auth"),
      import("@pi-dash/db/schema/event-interest"),
      import("@pi-dash/db/schema/team"),
      import("@pi-dash/db/schema/team-event"),
      import("drizzle-orm"),
    ]);

    return loadEventInterestContacts(data.eventId, context.session, {
      findEventTeamId: async (eventId) => {
        const [row] = await db
          .select({ teamId: teamEvent.teamId })
          .from(teamEvent)
          .where(eq(teamEvent.id, eventId))
          .limit(1);
        return row?.teamId;
      },
      isTeamLead: async (teamId, userId) => {
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
      listPendingContacts: (eventId) =>
        db
          .select({
            email: user.email,
            phone: user.phone,
            userId: user.id,
          })
          .from(eventInterest)
          .innerJoin(user, eq(user.id, eventInterest.userId))
          .where(
            and(
              eq(eventInterest.eventId, eventId),
              eq(eventInterest.status, "pending")
            )
          ),
      resolvePermissions,
    });
  });
