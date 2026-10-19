import { describe, expect, it, mock } from "bun:test";

import {
  type InterestContactsDeps,
  loadEventInterestContacts,
} from "./event-interest-contacts";

const contact = {
  email: "asha@example.com",
  phone: "+919876543210",
  userId: "volunteer-1",
};

const deps = ({
  isLead = false,
  permissions = [] as string[],
  teamId = "team-1" as null | string,
} = {}): InterestContactsDeps & {
  listPendingContacts: ReturnType<typeof mock>;
} => ({
  findEventTeamId: mock(async () => teamId ?? undefined),
  isTeamLead: mock(async (id: string) => isLead && id === "team-1"),
  listPendingContacts: mock(async () => [contact]),
  resolvePermissions: mock(async () => permissions),
});

const session = { user: { id: "lead-1", role: "volunteer" } };
const expected = {
  "volunteer-1": { email: contact.email, phone: contact.phone },
};

describe("loadEventInterestContacts", () => {
  it("returns contacts to a lead of the event's team", async () => {
    await expect(
      loadEventInterestContacts("event-1", session, deps({ isLead: true }))
    ).resolves.toEqual(expected);
  });

  it("returns contacts to an events.manage_interest holder", async () => {
    await expect(
      loadEventInterestContacts(
        "event-1",
        session,
        deps({ permissions: ["events.manage_interest"] })
      )
    ).resolves.toEqual(expected);
  });

  it("returns nothing to anyone else", async () => {
    const dependencies = deps();
    await expect(
      loadEventInterestContacts("event-1", session, dependencies)
    ).resolves.toEqual({});
    expect(dependencies.listPendingContacts).not.toHaveBeenCalled();
  });

  it("returns nothing to a lead of another team", async () => {
    const dependencies = deps({ isLead: true, teamId: "team-2" });
    await expect(
      loadEventInterestContacts("event-1", session, dependencies)
    ).resolves.toEqual({});
    expect(dependencies.listPendingContacts).not.toHaveBeenCalled();
  });

  it("returns nothing for an unknown event", async () => {
    const dependencies = deps({ isLead: true, teamId: null });
    await expect(
      loadEventInterestContacts("event-1", session, dependencies)
    ).resolves.toEqual({});
    expect(dependencies.listPendingContacts).not.toHaveBeenCalled();
  });

  it("returns nothing to an external user, even one holding a lead row", async () => {
    const dependencies = deps({
      isLead: true,
      permissions: ["events.manage_interest"],
    });
    await expect(
      loadEventInterestContacts(
        "event-1",
        { user: { id: "lead-1", role: "external_user" } },
        dependencies
      )
    ).resolves.toEqual({});
    expect(dependencies.listPendingContacts).not.toHaveBeenCalled();
  });

  it("returns nothing without a session", async () => {
    const dependencies = deps({ isLead: true });
    await expect(
      loadEventInterestContacts("event-1", null, dependencies)
    ).resolves.toEqual({});
    expect(dependencies.listPendingContacts).not.toHaveBeenCalled();
  });
});
