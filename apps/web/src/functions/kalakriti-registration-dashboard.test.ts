import type { KalakritiResponsibility } from "@pi-dash/shared/kalakriti";
import { describe, expect, it, vi } from "vitest";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import type { KalakritiRegistrationScope } from "@/lib/kalakriti-registration-scope-policy";
import type { KalakritiRegistrationDashboardProjection } from "@/lib/server/kalakriti-registration-dashboard";
import { resolveKalakritiRegistrationScope } from "@/lib/server/kalakriti-registration-scope";
import { resolveKalakritiRegistrationDashboardRequest } from "../lib/server/kalakriti-registration-dashboard-request";

vi.mock("@pi-dash/db", () => ({ db: { select: vi.fn() } }));

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

function projection(
  scope: KalakritiRegistrationScope
): KalakritiRegistrationDashboardProjection {
  return {
    ageCategories: [],
    centers: [],
    competitionCategories: [],
    competitions: [],
    quotas: [],
    scope,
    totals: {
      capacity: scope.kind === "center" ? null : 0,
      entries: 0,
      participants: 0,
      quotaLimit: 0,
      registeredStudents: 0,
      students: 0,
    },
  };
}

function dependencies(resolvedAccess: KalakritiEditionAccess | null) {
  const loadGuardianCenterIds = vi.fn(async () => ["center-2", "center-1"]);
  const resolveAccess = vi.fn(async () => resolvedAccess);
  return {
    getProjections: vi.fn(
      async ({
        scopes,
      }: {
        editionId: string;
        scopes: readonly KalakritiRegistrationScope[];
      }) => scopes.map(projection)
    ),
    loadGuardianCenterIds,
    resolveAccess,
    resolveScope: (
      input: Parameters<typeof resolveKalakritiRegistrationScope>[0]
    ) =>
      resolveKalakritiRegistrationScope(input, {
        loadGuardianCenterIds,
        resolveAccess,
      }),
  };
}

describe("resolveKalakritiRegistrationDashboardRequest", () => {
  it("returns no private data without a session or resolved Edition access", async () => {
    const deps = dependencies(null);

    await expect(
      resolveKalakritiRegistrationDashboardRequest(
        { sessionUser: null, year: 2027 },
        deps
      )
    ).resolves.toBeNull();
    await expect(
      resolveKalakritiRegistrationDashboardRequest(
        { sessionUser: { id: "user-1", role: "guest" }, year: 2027 },
        deps
      )
    ).resolves.toBeNull();

    expect(deps.getProjections).not.toHaveBeenCalled();
    expect(deps.loadGuardianCenterIds).not.toHaveBeenCalled();
  });

  it("derives Guardian Center scope on the server", async () => {
    const deps = dependencies(access({ kind: "guardian" }));

    await resolveKalakritiRegistrationDashboardRequest(
      { sessionUser: { id: "guardian-1", role: "guest" }, year: 2027 },
      deps
    );

    expect(deps.resolveAccess).toHaveBeenCalledWith({
      role: "guest",
      userId: "guardian-1",
      year: 2027,
    });
    expect(deps.getProjections).toHaveBeenCalledWith({
      editionId: "edition-1",
      scopes: [{ centerIds: ["center-1", "center-2"], kind: "center" }],
    });
  });

  it("requests one Edition projection for an administrator", async () => {
    const deps = dependencies(access({ isGlobalAdmin: true }));

    await resolveKalakritiRegistrationDashboardRequest(
      { sessionUser: { id: "admin-1", role: "admin" }, year: 2027 },
      deps
    );

    expect(deps.getProjections).toHaveBeenCalledWith({
      editionId: "edition-1",
      scopes: [{ kind: "edition" }],
    });
  });

  it("keeps mixed Category and Competition assignments in one snapshot request", async () => {
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

    const result = await resolveKalakritiRegistrationDashboardRequest(
      { sessionUser: { id: "lead-1", role: "volunteer" }, year: 2027 },
      deps
    );

    expect(deps.getProjections).toHaveBeenCalledTimes(1);
    expect(deps.getProjections).toHaveBeenCalledWith({
      editionId: "edition-1",
      scopes: [
        {
          competitionCategoryIds: ["category-1"],
          kind: "competition_category",
        },
        { competitionIds: ["competition-1"], kind: "competition" },
      ],
    });
    expect(result?.projections).toHaveLength(2);
  });
});
