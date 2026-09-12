import { describe, expect, it } from "bun:test";

import {
  getSessionEntryPermissions,
  selectWritableEntryCenters,
} from "./entry-permissions";

const admin = { isGlobalAdmin: true, membership: null };
describe("Entry music permissions", () => {
  it.each([
    "draft",
    "registration_open",
    "registration_locked",
    "live",
    "completed",
  ])("keeps music separate from closed registration in %s", (lifecycle) => {
    const permissions = getSessionEntryPermissions({
      access: admin,
      lifecycle,
      centerEnabled: false,
      registrationOpen: false,
    });
    expect(permissions.uploadMusic).toBe(true);
    expect(permissions.register).toBe(false);
    expect(permissions.edit).toBe(false);
    expect(permissions.remove).toBe(false);
  });
  it("makes archived music read-only", () => {
    expect(
      getSessionEntryPermissions({
        access: admin,
        lifecycle: "archived",
        centerEnabled: true,
        registrationOpen: false,
      }).uploadMusic
    ).toBe(false);
  });
  it("preserves scoped writer roles without granting read-only competition staff music access", () => {
    for (const [responsibility, expected] of [
      ["liaison", true],
      ["edition_admin", true],
      ["competition_coordinator", false],
      ["transport_lead", false],
    ] as const) {
      const access = {
        isGlobalAdmin: false,
        membership: {
          kind: "volunteer" as const,
          responsibilities: [responsibility],
          assignments: [],
        },
      };
      expect(
        getSessionEntryPermissions({
          access,
          lifecycle: "registration_locked",
          centerEnabled: false,
          registrationOpen: false,
        }).uploadMusic
      ).toBe(expected);
    }
  });
});

describe("Entry Center write boundaries", () => {
  const centers = [{ id: "a" }, { id: "b" }];
  it("keeps Guardian writes at the authorized Center boundary, not own-child ownership", () => {
    expect(
      selectWritableEntryCenters(centers, {
        isGlobalAdmin: false,
        membership: { kind: "guardian", responsibilities: [], assignments: [] },
      })
    ).toEqual(centers);
  });
  it("does not promote global read scope into write scope", () => {
    for (const responsibility of ["competition_coordinator", "liaison_lead"]) {
      expect(
        selectWritableEntryCenters(centers, {
          isGlobalAdmin: false,
          membership: {
            kind: "volunteer",
            responsibilities: [responsibility],
            assignments: [{ responsibility, centerId: null }],
          },
        })
      ).toEqual([]);
    }
  });
  it("limits Liaisons to their assigned Centers", () => {
    expect(
      selectWritableEntryCenters(centers, {
        isGlobalAdmin: false,
        membership: {
          kind: "volunteer",
          responsibilities: ["liaison"],
          assignments: [{ responsibility: "liaison", centerId: "b" }],
        },
      })
    ).toEqual([{ id: "b" }]);
  });
});
