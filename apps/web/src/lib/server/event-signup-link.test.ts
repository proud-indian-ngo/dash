import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db", () => ({ db: {} }));
mock.module("@pi-dash/auth/register-event-invite-db", () => ({
  issueRegisterEventInvite: async () => "token",
  revokeRegisterEventInvites: async () => undefined,
}));

const { createEventSignupLinkWithDeps, turnOffEventSignupLinkWithDeps } =
  await import("./event-signup-link");

type Deps = Parameters<typeof createEventSignupLinkWithDeps>[3];

const now = 1_700_000_000_000;
const startTime = new Date(now + 86_400_000);
const session = { user: { id: "user-1", role: "volunteer" } };

function createDeps(overrides: Partial<Deps> = {}) {
  const issue = mock(async () => "token-1");
  const revoke = mock(async () => undefined);
  const deps: Deps = {
    canManageEditionVolunteers: async () => false,
    findEdition: async () => null,
    findEvent: async () => ({
      cancelledAt: null,
      managementDomain: null,
      startTime,
      teamId: "team-1",
    }),
    isTeamLead: async () => false,
    issue,
    resolvePermissions: async () => [],
    revoke,
    ...overrides,
  };
  return { deps, issue, revoke };
}

function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: { status?: number }) => error.status
  );
}

describe("createEventSignupLinkWithDeps", () => {
  it("lets a team lead create a link that expires when the event starts", async () => {
    const { deps, issue } = createDeps({ isTeamLead: async () => true });
    await expect(
      createEventSignupLinkWithDeps(session, "event-1", now, deps)
    ).resolves.toEqual({ expiresAt: startTime.getTime(), token: "token-1" });
    expect(issue).toHaveBeenCalledWith({
      eventId: "event-1",
      expiresAt: startTime,
      issuedBy: "user-1",
    });
  });

  it("lets events.manage_members create a link", async () => {
    const { deps } = createDeps({
      resolvePermissions: async () => ["events.manage_members"],
    });
    await expect(
      createEventSignupLinkWithDeps(session, "event-1", now, deps)
    ).resolves.toMatchObject({ token: "token-1" });
  });

  it("refuses anyone who cannot add the event's members", async () => {
    const { deps, issue } = createDeps();
    expect(
      await rejection(
        createEventSignupLinkWithDeps(session, "event-1", now, deps)
      )
    ).toBe(403);
    expect(issue).not.toHaveBeenCalled();
  });

  it("refuses a missing, cancelled or started event", async () => {
    expect(
      await rejection(
        createEventSignupLinkWithDeps(
          session,
          "event-1",
          now,
          createDeps({ findEvent: async () => null }).deps
        )
      )
    ).toBe(404);
    for (const event of [
      { cancelledAt: new Date(now), startTime },
      { cancelledAt: null, startTime: new Date(now) },
    ]) {
      const { deps, issue } = createDeps({
        findEvent: async () => ({
          ...event,
          managementDomain: null,
          teamId: "team-1",
        }),
        isTeamLead: async () => true,
      });
      expect(
        await rejection(
          createEventSignupLinkWithDeps(session, "event-1", now, deps)
        )
      ).toBe(409);
      expect(issue).not.toHaveBeenCalled();
    }
  });

  it("takes Kalakriti authority from the Edition's volunteer roster, not events.manage_members", async () => {
    const edition = { lifecycle: "registration_open", year: 2095 };
    const denied = createDeps({
      findEdition: async () => edition,
      resolvePermissions: async () => ["events.manage_members"],
    });
    expect(
      await rejection(
        createEventSignupLinkWithDeps(session, "event-1", now, denied.deps)
      )
    ).toBe(403);

    const allowed = createDeps({
      canManageEditionVolunteers: async (_session, year) => year === 2095,
      findEdition: async () => edition,
    });
    await expect(
      createEventSignupLinkWithDeps(session, "event-1", now, allowed.deps)
    ).resolves.toMatchObject({ token: "token-1" });
  });

  it("refuses an archived Edition", async () => {
    const { deps } = createDeps({
      canManageEditionVolunteers: async () => true,
      findEdition: async () => ({ lifecycle: "archived", year: 2095 }),
    });
    expect(
      await rejection(
        createEventSignupLinkWithDeps(session, "event-1", now, deps)
      )
    ).toBe(409);
  });
});

describe("turnOffEventSignupLinkWithDeps", () => {
  it("turns the link off only for someone who manages it", async () => {
    const denied = createDeps();
    expect(
      await rejection(
        turnOffEventSignupLinkWithDeps(session, "event-1", denied.deps)
      )
    ).toBe(403);
    expect(denied.revoke).not.toHaveBeenCalled();

    const allowed = createDeps({ isTeamLead: async () => true });
    await turnOffEventSignupLinkWithDeps(session, "event-1", allowed.deps);
    expect(allowed.revoke).toHaveBeenCalledWith("event-1");
  });
});
