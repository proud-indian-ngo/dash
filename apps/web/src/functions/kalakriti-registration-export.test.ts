import type { KalakritiResponsibility } from "@pi-dash/shared/kalakriti";
import { describe, expect, it, vi } from "vitest";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import type { KalakritiRegistrationDashboardScope } from "@/lib/kalakriti-registration-dashboard-policy";
import { resolveKalakritiRegistrationExportRequest } from "@/lib/server/kalakriti-registration-export-request";

function assignment(
  responsibility: KalakritiResponsibility,
  scope: Partial<
    NonNullable<KalakritiEditionAccess["membership"]>["assignments"][number]
  > = {}
) {
  return {
    centerId: null,
    competitionCategoryId: null,
    competitionId: null,
    responsibility,
    ...scope,
  };
}

function access({
  assignments = [],
  isGlobalAdmin = false,
  kind = "volunteer",
}: {
  assignments?: NonNullable<
    KalakritiEditionAccess["membership"]
  >["assignments"];
  isGlobalAdmin?: boolean;
  kind?: "guardian" | "volunteer";
} = {}): KalakritiEditionAccess {
  return {
    edition: {
      ageCutoffDate: "2027-01-01",
      eventDate: "2027-11-21",
      id: "edition-1",
      lifecycle: "registration_open",
      name: "Kalakriti 2027",
      plannedRegistrationCloseAt: Date.UTC(2027, 8, 1),
      teamEventId: "event-1",
      timezone: "Asia/Kolkata",
      year: 2027,
    },
    isGlobalAdmin,
    membership: isGlobalAdmin
      ? null
      : {
          assignments,
          id: "membership-1",
          kind,
          responsibilities: assignments.map(
            ({ responsibility }) => responsibility
          ),
        },
  };
}

function dependencies(resolvedAccess: KalakritiEditionAccess | null) {
  return {
    getExport: vi.fn(
      async ({
        scopes,
      }: {
        editionId: string;
        scopes: readonly KalakritiRegistrationDashboardScope[];
      }) => ({
        entries: [],
        students: scopes.map((scope) => ({
          ageCategory: scope.kind,
          center: "",
          dateOfBirth: "",
          gender: "",
          name: "",
          studentId: "",
        })),
      })
    ),
    loadGuardianCenterIds: vi.fn(async () => ["center-2", "center-1"]),
    resolveAccess: vi.fn(async () => resolvedAccess),
  };
}

describe("resolveKalakritiRegistrationExportRequest", () => {
  it("returns no data without a session, Edition access, or export assignment", async () => {
    const noAccess = dependencies(null);
    await expect(
      resolveKalakritiRegistrationExportRequest(
        { sessionUser: null, year: 2027 },
        noAccess
      )
    ).resolves.toBeNull();
    await expect(
      resolveKalakritiRegistrationExportRequest(
        { sessionUser: { id: "user-1", role: "guest" }, year: 2027 },
        noAccess
      )
    ).resolves.toBeNull();
    expect(noAccess.getExport).not.toHaveBeenCalled();

    const unassigned = dependencies(access());
    await expect(
      resolveKalakritiRegistrationExportRequest(
        { sessionUser: { id: "volunteer-1", role: "volunteer" }, year: 2027 },
        unassigned
      )
    ).resolves.toBeNull();
    expect(unassigned.getExport).not.toHaveBeenCalled();
  });

  it("derives Guardian Center scope on the server", async () => {
    const deps = dependencies(access({ kind: "guardian" }));

    await resolveKalakritiRegistrationExportRequest(
      { sessionUser: { id: "guardian-1", role: "guest" }, year: 2027 },
      deps
    );

    expect(deps.getExport).toHaveBeenCalledWith({
      editionId: "edition-1",
      scopes: [{ centerIds: ["center-1", "center-2"], kind: "center" }],
    });
  });

  it("grants administrators the complete Edition export", async () => {
    const deps = dependencies(access({ isGlobalAdmin: true }));

    await resolveKalakritiRegistrationExportRequest(
      { sessionUser: { id: "admin-1", role: "admin" }, year: 2027 },
      deps
    );

    expect(deps.getExport).toHaveBeenCalledWith({
      editionId: "edition-1",
      scopes: [{ kind: "edition" }],
    });
  });

  it("preserves the union of Category and Competition assignments", async () => {
    const deps = dependencies(
      access({
        assignments: [
          assignment("competition_category_lead", {
            competitionCategoryId: "category-1",
          }),
          assignment("competition_coordinator", {
            competitionId: "competition-1",
          }),
        ],
      })
    );

    await resolveKalakritiRegistrationExportRequest(
      { sessionUser: { id: "lead-1", role: "volunteer" }, year: 2027 },
      deps
    );

    expect(deps.getExport).toHaveBeenCalledWith({
      editionId: "edition-1",
      scopes: [
        {
          competitionCategoryIds: ["category-1"],
          kind: "competition_category",
        },
        { competitionIds: ["competition-1"], kind: "competition" },
      ],
    });
  });
});
