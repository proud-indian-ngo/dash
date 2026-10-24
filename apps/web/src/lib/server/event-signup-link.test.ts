import { describe, expect, it, mock } from "bun:test";

import { verifyEventSignupLink } from "@pi-dash/auth/event-signup-link";

mock.module("@pi-dash/db", () => ({ db: {} }));

const { createEventSignupLinkWithDeps } = await import("./event-signup-link");

type Deps = Parameters<typeof createEventSignupLinkWithDeps>[3];

const now = 1_700_000_000_000;
const startTime = new Date(now + 86_400_000);
const eventId = "019f0000-0019-7000-8000-000000001983";
const secret = "test-event-signup-link-secret-0000000000";
const session = { user: { id: "user-1", role: "volunteer" } };

function createDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    canManageEditionVolunteers: async () => false,
    findEdition: async () => null,
    findEvent: async () => ({
      cancelledAt: null,
      managementDomain: null,
      startTime,
      teamId: "team-1",
    }),
    isTeamLead: async () => false,
    resolvePermissions: async () => [],
    secret,
    ...overrides,
  };
}

function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: { status?: number }) => error.status
  );
}

describe("createEventSignupLinkWithDeps", () => {
  it("lets a team lead sign a link that works until the event starts", async () => {
    const link = await createEventSignupLinkWithDeps(
      session,
      eventId,
      now,
      createDeps({ isTeamLead: async () => true })
    );
    expect(link).toMatchObject({ eventId, expiresAt: startTime.getTime() });
    expect(verifyEventSignupLink(secret, eventId, link.sig)).toBe(true);
  });

  it("lets events.manage_members sign a link", async () => {
    await expect(
      createEventSignupLinkWithDeps(
        session,
        eventId,
        now,
        createDeps({
          resolvePermissions: async () => ["events.manage_members"],
        })
      )
    ).resolves.toMatchObject({ eventId });
  });

  it("refuses anyone who cannot add the event's members", async () => {
    expect(
      await rejection(
        createEventSignupLinkWithDeps(session, eventId, now, createDeps())
      )
    ).toBe(403);
  });

  it("refuses a missing, cancelled or started event", async () => {
    expect(
      await rejection(
        createEventSignupLinkWithDeps(
          session,
          eventId,
          now,
          createDeps({ findEvent: async () => null })
        )
      )
    ).toBe(404);
    for (const event of [
      { cancelledAt: new Date(now), startTime },
      { cancelledAt: null, startTime: new Date(now) },
    ]) {
      const deps = createDeps({
        findEvent: async () => ({
          ...event,
          managementDomain: null,
          teamId: "team-1",
        }),
        isTeamLead: async () => true,
      });
      expect(
        await rejection(
          createEventSignupLinkWithDeps(session, eventId, now, deps)
        )
      ).toBe(409);
    }
  });

  it("refuses when sign-up links are not set up", async () => {
    const deps = createDeps({
      isTeamLead: async () => true,
      secret: undefined,
    });
    expect(
      await rejection(
        createEventSignupLinkWithDeps(session, eventId, now, deps)
      )
    ).toBe(409);
  });

  it("takes Kalakriti authority from the Edition's volunteer roster, not events.manage_members", async () => {
    const edition = { lifecycle: "registration_open", year: 2095 };
    const denied = createDeps({
      findEdition: async () => edition,
      resolvePermissions: async () => ["events.manage_members"],
    });
    expect(
      await rejection(
        createEventSignupLinkWithDeps(session, eventId, now, denied)
      )
    ).toBe(403);

    const allowed = createDeps({
      canManageEditionVolunteers: async (_session, year) => year === 2095,
      findEdition: async () => edition,
    });
    await expect(
      createEventSignupLinkWithDeps(session, eventId, now, allowed)
    ).resolves.toMatchObject({ eventId });
  });

  it("refuses an archived Edition", async () => {
    const deps = createDeps({
      canManageEditionVolunteers: async () => true,
      findEdition: async () => ({ lifecycle: "archived", year: 2095 }),
    });
    expect(
      await rejection(
        createEventSignupLinkWithDeps(session, eventId, now, deps)
      )
    ).toBe(409);
  });
});
