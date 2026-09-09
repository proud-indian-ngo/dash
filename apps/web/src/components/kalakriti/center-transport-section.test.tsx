import { describe, expect, it, mock } from "bun:test";

import {
  KALAKRITI_TRANSPORT_STATUS_LABELS,
  type KalakritiTransportStatus,
} from "@pi-dash/shared/kalakriti";
import { renderToStaticMarkup } from "react-dom/server";

import {
  getCenterTransportCapabilities,
  type KalakritiCenterRegistrationAccess,
} from "@/lib/kalakriti-center-registration-policy";

mock.module("@rocicorp/zero/react", () => ({ useZero: () => ({}) }));
mock.module("@/components/kalakriti/center-transport-form-dialog", () => ({
  CenterTransportFormDialog: () => <span>Transport form</span>,
}));
const { CenterTransportSection } = await import("./center-transport-section");

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
const assignment = {
  id: "transport",
  capacity: 40,
  driverName: "Driver",
  driverPhone: null,
  notes: null,
  status: "planned" as const,
  vehicleLabel: "Bus 1",
};
function render(
  canManageTransport: boolean,
  isRetired = false,
  status: KalakritiTransportStatus = "planned"
) {
  return renderToStaticMarkup(
    <CenterTransportSection
      assignments={[{ ...assignment, status }]}
      canManageTransport={canManageTransport}
      isRetired={isRetired}
      centerId="center"
      editionId="edition"
    />
  );
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
        const html = render(capabilities.canManageTransport);
        expect(html).toContain("Bus 1");
        expect(html).not.toContain("Add vehicle");
        expect(html).not.toContain(">Edit<");
        expect(html).not.toContain("Transport form");
        expect(html).not.toContain(">Delete<");
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
  it("keeps assignment details readable without controls or a mounted writable form", () => {
    const html = render(false);
    expect(html).toContain("Bus 1");
    expect(html).toContain("Driver");
    expect(html).not.toContain("Add vehicle");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain("Transport form");
  });
  it("retired Centers suppress transport writes even for managers", () => {
    const html = render(true, true);
    expect(html).toContain("Bus 1");
    expect(html).not.toContain("Add vehicle");
    expect(html).not.toContain("Transport form");
  });
  it("preserves active Center management controls and offers delete", () => {
    expect(render(true)).toContain("Add vehicle");
    expect(render(true)).toContain("Transport form");
    expect(render(true)).toContain("Delete");
  });
  it("keeps every status as a badge without manual advancement controls", () => {
    for (const [status, label] of Object.entries(
      KALAKRITI_TRANSPORT_STATUS_LABELS
    )) {
      const html = render(true, false, status as KalakritiTransportStatus);
      expect(html).toContain(label);
      const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
      for (const button of buttons) {
        for (const statusLabel of Object.values(
          KALAKRITI_TRANSPORT_STATUS_LABELS
        )) {
          expect(button).not.toContain(statusLabel);
        }
      }
    }
  });
});
