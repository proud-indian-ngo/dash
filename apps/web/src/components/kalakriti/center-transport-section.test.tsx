import { describe, expect, it } from "bun:test";

import {
  getCenterTransportCapabilities,
  type KalakritiCenterRegistrationAccess,
} from "@/lib/kalakriti-center-registration-policy";

function access(
  responsibility: string,
  centerId = "center"
): KalakritiCenterRegistrationAccess {
  return {
    isGlobalAdmin: false,
    membership: {
      kind: "volunteer",
      responsibilities: [responsibility],
      assignments: [{ centerId, responsibility }],
    },
  };
}
describe("Center transport compatibility", () => {
  it.each(["edition_admin", "transport_lead"])(
    "keeps authorized %s read access but disables archived writes",
    (responsibility) => {
      expect(
        getCenterTransportCapabilities({
          access: access(responsibility),
          centerId: "center",
          lifecycle: "archived",
        })
      ).toEqual({ canManageTransport: false, canViewTransport: true });
      expect(
        getCenterTransportCapabilities({
          access: access(responsibility),
          centerId: "center",
          lifecycle: "live",
        }).canManageTransport
      ).toBe(true);
    }
  );
  it.each(["liaison", "center_liaison_lead", "liaison_volunteer"])(
    "does not widen %s to another Center",
    (responsibility) => {
      expect(
        getCenterTransportCapabilities({
          access: access(responsibility, "other"),
          centerId: "center",
          lifecycle: "live",
        })
      ).toEqual({ canManageTransport: false, canViewTransport: false });
    }
  );
  it.each(["liaison", "center_liaison_lead", "liaison_volunteer"])(
    "keeps %s read-only in its own Center in every lifecycle",
    (responsibility) => {
      for (const lifecycle of [
        "draft",
        "registration_open",
        "registration_locked",
        "live",
        "archived",
      ]) {
        const capabilities = getCenterTransportCapabilities({
          access: access(responsibility),
          centerId: "center",
          lifecycle,
        });
        expect(capabilities).toEqual({
          canManageTransport: false,
          canViewTransport: true,
        });
      }
    }
  );
  it("preserves global administration but excludes Guardians and unrelated volunteers", () => {
    expect(
      getCenterTransportCapabilities({
        access: { isGlobalAdmin: true, membership: null },
        centerId: "center",
        lifecycle: "live",
      }).canManageTransport
    ).toBe(true);
    expect(
      getCenterTransportCapabilities({
        access: access("food_lead"),
        centerId: "center",
        lifecycle: "live",
      }).canViewTransport
    ).toBe(false);
    const guardian = access("transport_lead");
    guardian.membership!.kind = "guardian";
    expect(
      getCenterTransportCapabilities({
        access: guardian,
        centerId: "center",
        lifecycle: "live",
      }).canViewTransport
    ).toBe(false);
  });
  it.each(["registration_open", "live", "archived"])(
    "keeps a Guardian's visible Center transport read-only in %s",
    (lifecycle) => {
      const guardian = {
        isGlobalAdmin: false,
        membership: {
          kind: "guardian" as const,
          responsibilities: [],
          assignments: [],
        },
      };
      expect(
        getCenterTransportCapabilities({
          access: guardian,
          centerId: "center",
          lifecycle,
          guardianCenterVisible: true,
        })
      ).toEqual({ canViewTransport: true, canManageTransport: false });
      expect(
        getCenterTransportCapabilities({
          access: guardian,
          centerId: "outside",
          lifecycle,
          guardianCenterVisible: false,
        })
      ).toEqual({ canViewTransport: false, canManageTransport: false });
    }
  );
  it("does not grant unrelated volunteers transport read just because their Center is visible", () => {
    expect(
      getCenterTransportCapabilities({
        access: access("food_lead"),
        centerId: "center",
        lifecycle: "live",
        guardianCenterVisible: true,
      }).canViewTransport
    ).toBe(false);
  });
});
