import { describe, expect, it } from "bun:test";

import {
  assertAssignedCentralEmailUnchanged,
  canManageKalakritiGuardians,
  canViewKalakritiGuardians,
  decideGuardianIdentity,
  type GuardianIdentityCandidate,
  guardianContactChangedFields,
  shouldBlockExternalIdentity,
} from "./kalakriti-guardian-policy";

describe("Guardian roster permissions", () => {
  const access = (responsibility: string, lifecycle = "live") => ({
    edition: { lifecycle },
    isGlobalAdmin: false,
    membership: { responsibilities: [responsibility] },
  });

  it.each(["volunteer_coordinator", "volunteer_management_volunteer"])(
    "gives %s read-only access",
    (responsibility) => {
      const candidate = access(responsibility);
      expect(canViewKalakritiGuardians(candidate)).toBe(true);
      expect(canManageKalakritiGuardians(candidate)).toBe(false);
      expect(
        canViewKalakritiGuardians(access(responsibility, "archived"))
      ).toBe(false);
    }
  );

  it("preserves archived Guardian reads for Edition Administrators", () => {
    expect(canViewKalakritiGuardians(access("edition_admin", "archived"))).toBe(
      true
    );
  });
});

const dormantExternal: GuardianIdentityCandidate = {
  banned: true,
  canAccessKalakriti: true,
  emailVerified: true,
  hasActiveMembership: false,
  hasEditionMembership: false,
  isExternal: true,
  role: "external_user",
};

describe("Guardian identity policy", () => {
  it("creates a new external identity only when an initial password exists", () => {
    expect(
      decideGuardianIdentity({
        candidate: null,
        confirmReuse: false,
        hasPassword: true,
      })
    ).toBe("create_external");
    expect(() =>
      decideGuardianIdentity({
        candidate: null,
        confirmReuse: false,
        hasPassword: false,
      })
    ).toThrow("password");
  });

  it("requires explicit confirmation before reusing a dormant exact email", () => {
    expect(
      decideGuardianIdentity({
        candidate: dormantExternal,
        confirmReuse: false,
        hasPassword: false,
      })
    ).toBe("require_reuse_confirmation");
    expect(
      decideGuardianIdentity({
        candidate: dormantExternal,
        confirmReuse: true,
        hasPassword: false,
      })
    ).toBe("reactivate_external");
  });

  it("never reuses unverified, active, or same-Edition identities", () => {
    expect(() =>
      decideGuardianIdentity({
        candidate: { ...dormantExternal, emailVerified: false },
        confirmReuse: true,
        hasPassword: false,
      })
    ).toThrow("not verified");
    expect(() =>
      decideGuardianIdentity({
        candidate: { ...dormantExternal, hasActiveMembership: true },
        confirmReuse: true,
        hasPassword: false,
      })
    ).toThrow("active Kalakriti Edition");
    expect(() =>
      decideGuardianIdentity({
        candidate: { ...dormantExternal, hasEditionMembership: true },
        confirmReuse: true,
        hasPassword: false,
      })
    ).toThrow("already has a membership");
  });

  it("assigns a verified central identity without converting it", () => {
    expect(
      decideGuardianIdentity({
        candidate: {
          ...dormantExternal,
          banned: false,
          isExternal: false,
          role: "volunteer",
        },
        confirmReuse: false,
        hasPassword: false,
      })
    ).toBe("assign_central");
  });

  it("rejects a central identity without Kalakriti access", () => {
    expect(() =>
      decideGuardianIdentity({
        candidate: {
          ...dormantExternal,
          banned: false,
          canAccessKalakriti: false,
          isExternal: false,
          role: "unoriented_volunteer",
        },
        confirmReuse: false,
        hasPassword: false,
      })
    ).toThrow("cannot access Kalakriti");
  });

  it("rejects an external user until its identity marker is committed", () => {
    expect(() =>
      decideGuardianIdentity({
        candidate: {
          ...dormantExternal,
          banned: false,
          isExternal: false,
        },
        confirmReuse: false,
        hasPassword: false,
      })
    ).toThrow("still being provisioned");
  });

  it("blocks only marked external identities after their final membership", () => {
    expect(
      shouldBlockExternalIdentity({
        hasExternalMarker: true,
        hasOtherActiveMembership: false,
      })
    ).toBe(true);
    expect(
      shouldBlockExternalIdentity({
        hasExternalMarker: false,
        hasOtherActiveMembership: false,
      })
    ).toBe(false);
    expect(
      shouldBlockExternalIdentity({
        hasExternalMarker: true,
        hasOtherActiveMembership: true,
      })
    ).toBe(false);
  });

  it("reports only contact fields that changed", () => {
    expect(
      guardianContactChangedFields({
        current: {
          email: "guardian@example.test",
          name: "Guardian",
          phone: "+919999999999",
        },
        next: {
          email: "guardian@example.test",
          name: "Guardian",
          phone: "+919999999999",
        },
      })
    ).toEqual([]);
    expect(
      guardianContactChangedFields({
        current: {
          email: "Guardian@example.test",
          name: "Old Name",
          phone: null,
        },
        next: {
          email: "guardian-edited@example.test",
          name: "New Name",
          phone: "+919888888888",
        },
      })
    ).toEqual(["name", "email", "phone"]);
  });

  it("blocks email changes on assigned central Guardian accounts", () => {
    expect(() =>
      assertAssignedCentralEmailUnchanged({
        emailChanged: true,
        isExternal: false,
      })
    ).toThrow("cannot be changed");
    expect(() =>
      assertAssignedCentralEmailUnchanged({
        emailChanged: true,
        isExternal: true,
      })
    ).not.toThrow();
    expect(() =>
      assertAssignedCentralEmailUnchanged({
        emailChanged: false,
        isExternal: false,
      })
    ).not.toThrow();
  });
});
