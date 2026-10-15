import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db", () => ({ db: {} }));

import {
  ALL_VOLUNTEERS_GROUP_CONFIG_KEY,
  decideWhatsAppGroupAccess,
  ORIENTATION_GROUP_CONFIG_KEY,
  resolveWhatsAppGroupAccess,
  type WhatsAppGroupAccessFacts,
} from "./whatsapp-group-access";

const group = { jid: "120363@g.us", name: "Spoken English" };

function facts(
  overrides: Partial<WhatsAppGroupAccessFacts> = {}
): WhatsAppGroupAccessFacts {
  return {
    configKeys: [],
    events: [],
    group,
    teams: [],
    userRole: "volunteer",
    ...overrides,
  };
}

describe("decideWhatsAppGroupAccess", () => {
  it("allows a current member of the team using the group", () => {
    expect(
      decideWhatsAppGroupAccess(
        facts({ teams: [{ id: "team-1", isMember: true }] })
      )
    ).toEqual({
      backPath: "/teams/team-1",
      jid: group.jid,
      name: group.name,
      status: "allowed",
    });
  });

  it("denies someone removed from the team without naming the group", () => {
    const access = decideWhatsAppGroupAccess(
      facts({ teams: [{ id: "team-1", isMember: false }] })
    );
    expect(access).toEqual({ backPath: "/teams/team-1", status: "not_member" });
    expect(JSON.stringify(access)).not.toContain(group.name);
  });

  it("allows an event member and links back to the event", () => {
    expect(
      decideWhatsAppGroupAccess(
        facts({
          events: [
            { id: "series", isMember: false, isSeriesException: false },
            { id: "exception", isMember: true, isSeriesException: true },
          ],
        })
      )
    ).toMatchObject({ backPath: "/events/exception", status: "allowed" });
  });

  it("denies someone not on the event and links to the series event", () => {
    expect(
      decideWhatsAppGroupAccess(
        facts({
          events: [
            { id: "exception", isMember: false, isSeriesException: true },
            { id: "series", isMember: false, isSeriesException: false },
          ],
        })
      )
    ).toEqual({ backPath: "/events/series", status: "not_member" });
  });

  it("allows the all-volunteers group only for oriented people", () => {
    const allVolunteers = { configKeys: [ALL_VOLUNTEERS_GROUP_CONFIG_KEY] };
    expect(
      decideWhatsAppGroupAccess(facts({ ...allVolunteers, userRole: "admin" }))
        .status
    ).toBe("allowed");
    expect(
      decideWhatsAppGroupAccess(
        facts({ ...allVolunteers, userRole: "unoriented_volunteer" })
      )
    ).toEqual({ backPath: null, status: "not_member" });
  });

  it("allows the orientation group only for people not yet oriented", () => {
    const orientation = { configKeys: [ORIENTATION_GROUP_CONFIG_KEY] };
    expect(
      decideWhatsAppGroupAccess(
        facts({ ...orientation, userRole: "unoriented_volunteer" })
      ).status
    ).toBe("allowed");
    expect(
      decideWhatsAppGroupAccess(
        facts({ ...orientation, userRole: "volunteer" })
      ).status
    ).toBe("not_member");
  });

  it("denies a group nobody is entitled to through pi-dash", () => {
    expect(decideWhatsAppGroupAccess(facts())).toEqual({
      backPath: null,
      status: "not_member",
    });
  });

  it("reports an unknown group as not found", () => {
    expect(decideWhatsAppGroupAccess(facts({ group: null }))).toEqual({
      backPath: null,
      status: "not_found",
    });
  });
});

describe("resolveWhatsAppGroupAccess", () => {
  it("loads facts for the group and person", async () => {
    const loadFacts = mock(async () =>
      facts({ teams: [{ id: "team-1", isMember: true }] })
    );
    const access = await resolveWhatsAppGroupAccess(
      "group-1",
      "user-1",
      loadFacts
    );
    expect(loadFacts).toHaveBeenCalledWith("group-1", "user-1");
    expect(access.status).toBe("allowed");
  });
});
