import { describe, expect, it, mock } from "bun:test";

import {
  type EventContactsAccess,
  type EventContactsDeps,
  loadEventContacts,
} from "./event-contacts";

const contact = {
  email: "asha@example.com",
  phone: "+919876543210",
  userId: "volunteer-1",
};

const deps = ({
  event = { managementDomain: null, teamId: "team-1" } as null | {
    managementDomain: null | string;
    teamId: string;
  },
  isLead = false,
  permissions = [] as string[],
} = {}): EventContactsDeps & {
  listContacts: ReturnType<typeof mock>;
} => ({
  findEvent: mock(async () => event ?? undefined),
  isTeamLead: mock(async (id: string) => isLead && id === "team-1"),
  listContacts: mock(async () => [contact]),
  resolvePermissions: mock(async () => permissions),
});

const session = { user: { id: "lead-1", role: "volunteer" } };
const access: EventContactsAccess = { permission: "events.manage_interest" };
const expected = {
  "volunteer-1": { email: contact.email, phone: contact.phone },
};

describe("loadEventContacts", () => {
  it("returns contacts to a lead of the event's team", async () => {
    await expect(
      loadEventContacts("event-1", session, access, deps({ isLead: true }))
    ).resolves.toEqual(expected);
  });

  it("returns contacts to a holder of the permission", async () => {
    await expect(
      loadEventContacts(
        "event-1",
        session,
        access,
        deps({ permissions: [access.permission] })
      )
    ).resolves.toEqual(expected);
  });

  it("returns nothing to anyone else", async () => {
    const dependencies = deps();
    await expect(
      loadEventContacts("event-1", session, access, dependencies)
    ).resolves.toEqual({});
    expect(dependencies.listContacts).not.toHaveBeenCalled();
  });

  it("returns nothing to a lead of another team", async () => {
    const dependencies = deps({
      event: { managementDomain: null, teamId: "team-2" },
      isLead: true,
    });
    await expect(
      loadEventContacts("event-1", session, access, dependencies)
    ).resolves.toEqual({});
    expect(dependencies.listContacts).not.toHaveBeenCalled();
  });

  it("returns nothing for an unknown event", async () => {
    const dependencies = deps({ event: null, isLead: true });
    await expect(
      loadEventContacts("event-1", session, access, dependencies)
    ).resolves.toEqual({});
    expect(dependencies.listContacts).not.toHaveBeenCalled();
  });

  it("returns nothing on a Kalakriti event when that access excludes them", async () => {
    const dependencies = deps({
      event: { managementDomain: "kalakriti", teamId: "team-1" },
      isLead: true,
      permissions: ["events.edit"],
    });
    await expect(
      loadEventContacts(
        "event-1",
        session,
        { excludeKalakritiEvents: true, permission: "events.edit" },
        dependencies
      )
    ).resolves.toEqual({});
    expect(dependencies.listContacts).not.toHaveBeenCalled();
  });

  it("keeps Kalakriti events when that access does not exclude them", async () => {
    await expect(
      loadEventContacts(
        "event-1",
        session,
        access,
        deps({
          event: { managementDomain: "kalakriti", teamId: "team-1" },
          isLead: true,
        })
      )
    ).resolves.toEqual(expected);
  });

  it("returns nothing to an external user, even one holding a lead row", async () => {
    const dependencies = deps({
      isLead: true,
      permissions: [access.permission],
    });
    await expect(
      loadEventContacts(
        "event-1",
        { user: { id: "lead-1", role: "external_user" } },
        access,
        dependencies
      )
    ).resolves.toEqual({});
    expect(dependencies.listContacts).not.toHaveBeenCalled();
  });

  it("returns nothing without a session", async () => {
    const dependencies = deps({ isLead: true });
    await expect(
      loadEventContacts("event-1", null, access, dependencies)
    ).resolves.toEqual({});
    expect(dependencies.listContacts).not.toHaveBeenCalled();
  });
});
