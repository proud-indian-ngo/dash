import { describe, expect, it, mock } from "bun:test";

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

mock.module("@rocicorp/zero/react", () => ({
  useQuery: () => [
    [
      {
        membershipId: "guardian",
        center: {
          id: "ours",
          name: "Assigned Center",
          studentRegistrationEnabled: true,
          competitionEntryRegistrationEnabled: false,
          retiredAt: null,
        },
      },
      { membershipId: "other", center: { id: "other", name: "Other Center" } },
    ],
    { type: "complete" },
  ],
}));
mock.module("@/components/kalakriti/person-qr-panel", () => ({
  PersonQrPanel: ({ id, type }: { id: string; type: string }) => (
    <div data-person-id={id} data-person-type={type}>
      Person QR panel
    </div>
  ),
}));
const Container = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
);
mock.module("@pi-dash/design-system/components/ui/sheet", () => ({
  Sheet: Container,
  SheetContent: Container,
  SheetHeader: Container,
  SheetTitle: Container,
  SheetDescription: Container,
}));

import { GuardianDetailSheet } from "./guardian-detail-sheet";

function render(
  isGlobalAdmin: boolean,
  state: "active" | "archived" = "active",
  humanId: string | null = "KALG-2026-0001"
) {
  return renderToStaticMarkup(
    <GuardianDetailSheet
      access={
        {
          edition: { id: "edition", year: 2026 },
          isGlobalAdmin,
          membership: { responsibilities: [] },
        } as unknown as KalakritiEditionAccess
      }
      guardian={{
        id: "guardian",
        humanId,
        isExternal: true,
        snapshotName: "Guardian",
        snapshotEmail: null,
        snapshotPhone: null,
        state,
      }}
      onArchive={() => undefined}
      onEdit={() => undefined}
      onOpenChange={() => undefined}
      open
    />
  );
}

describe("Guardian detail sheet", () => {
  it("shows the yearly ID independently from the unchanged membership UUID QR", () => {
    const html = render(true);
    expect(html).toContain("Yearly ID");
    expect(html).toContain("KALG-2026-0001");
    expect(html).toContain('data-person-id="guardian"');
    expect(html).toContain('data-person-type="guardian"');
    const historical = render(true, "active", null);
    expect(historical).toContain("—");
    expect(historical).not.toContain("KALG-");
    expect(historical).toContain('data-person-id="guardian"');
  });
  it("shows only the selected Guardian's assigned Center details", () => {
    const html = render(true);
    expect(html).toContain("Assigned Center");
    expect(html).not.toContain("Other Center");
    expect(html).toContain("Student registration");
    expect(html).toContain("Entry registration");
  });
  it("shows the QR panel regardless of credential management policy or membership state", () => {
    expect(render(true)).toContain("Person QR panel");
    expect(render(false)).toContain("Person QR panel");
    expect(render(true, "archived")).toContain("Person QR panel");
  });
});
