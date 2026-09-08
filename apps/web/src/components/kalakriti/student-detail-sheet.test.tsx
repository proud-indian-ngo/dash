import { describe, expect, it, mock } from "bun:test";

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let entries: unknown[] = [];
let resultType = "complete";
mock.module("@rocicorp/zero/react", () => ({
  useQuery: () => [entries, { type: resultType }],
}));
mock.module("@/components/kalakriti/person-qr-panel", () => ({
  PersonQrPanel: ({
    id,
    type,
    enabled,
  }: {
    id: string;
    type: string;
    enabled?: boolean;
  }) =>
    enabled ? (
      <div>
        Person QR panel: {type}:{id}
      </div>
    ) : null,
}));
mock.module("@/components/loader", () => ({
  Loader: () => <div>Loading indicator</div>,
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

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

import { StudentDetailSheet } from "./student-detail-sheet";

function render(isGlobalAdmin = false, humanId = "KALS-2026-1", open = true) {
  return renderToStaticMarkup(
    <StudentDetailSheet
      access={
        {
          edition: { id: "edition", year: 2026 },
          isGlobalAdmin,
          membership: { kind: "guardian", responsibilities: [] },
        } as unknown as KalakritiEditionAccess
      }
      center={{
        id: "center",
        name: "Our Center",
        studentRegistrationEnabled: false,
        competitionEntryRegistrationEnabled: false,
      }}
      onOpenChange={() => undefined}
      open={open}
      student={{
        id: "student",
        centerId: "center",
        name: "Student One",
        humanId,
        dateOfBirth: 1_400_000_000_000,
        gender: "female",
        ageCategoryId: "age",
        derivedAgeCategoryId: "age",
        ageCategoryOverrideReason: null,
      }}
    />
  );
}

function entry(id: string, overrides = {}) {
  return {
    id,
    editionId: "edition",
    centerId: "center",
    participationMode: "individual",
    members: [{ studentId: "student" }],
    division: { competition: { name: id }, ageCategory: { name: "Junior" } },
    ...overrides,
  };
}

describe("Student detail sheet", () => {
  it("passes the database ID and student type to QR for scoped viewers regardless of yearly ID", () => {
    expect(render()).toContain("Person QR panel: student:student");
    expect(render(false, "")).toContain("Person QR panel: student:student");
    expect(render(false, "KALS-2026-1", false)).not.toContain(
      "Person QR panel"
    );
  });
  it.each([false, true])(
    "shows a retryable error instead of loading or cached rows (cached: %s)",
    (cached) => {
      entries = cached ? [entry("Stale Competition")] : [];
      resultType = "error";
      const html = render();
      expect(html).toContain('role="alert"');
      expect(html).toContain("Competitions could not be loaded.");
      expect(html).toContain("Retry");
      expect(html).not.toContain("Loading indicator");
      expect(html).not.toContain("Stale Competition");
      expect(html).not.toContain("No Competition Entries yet.");
      resultType = "complete";
    }
  );
  it("shows individual and group participation without unrelated rows", () => {
    entries = [
      entry("Solo"),
      entry("Dance", {
        participationMode: "group",
        members: [{ studentId: "other" }, { studentId: "student" }],
      }),
      entry("Other Student", { members: [{ studentId: "other" }] }),
      entry("Other Center", { centerId: "other" }),
      entry("Other Edition", { editionId: "other" }),
    ];
    const html = render();
    expect(html).toContain("Solo");
    expect(html).toContain("Dance");
    expect(html).toContain("Group");
    expect(html).toContain("Individual");
    expect(html).not.toContain("Other Student");
    expect(html).not.toContain("Other Center");
    expect(html).not.toContain("Other Edition");
    expect(html).toContain("Our Center");
    expect(html).toContain("Closed");
    expect(html).toContain("Person QR panel: student:student");
    expect(render(true)).toContain("Person QR panel");
  });

  it("keeps cached participation during sync and labels cancelled competitions", () => {
    resultType = "unknown";
    entries = [
      entry("Cancelled Dance", {
        division: {
          competition: { name: "Cancelled Dance", cancelledAt: 123 },
        },
      }),
    ];
    const html = render();
    expect(html).toContain("Cancelled Dance");
    expect(html).toContain(">Cancelled<");
    expect(html).not.toContain("Loading indicator");
    resultType = "complete";
  });

  it("distinguishes first loading from empty participation", () => {
    entries = [];
    resultType = "unknown";
    expect(render()).toContain("Loading indicator");
    resultType = "complete";
    expect(render()).toContain("No Competition Entries yet.");
  });
});
