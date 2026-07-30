import type { KalakritiResponsibility } from "@pi-dash/shared/kalakriti";
import { describe, expect, it } from "vitest";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { resolveKalakritiRegistrationScopes } from "./kalakriti-registration-scope-policy";

function access({
  assignments = [],
  isGlobalAdmin = false,
  kind = "volunteer",
  lifecycle = "registration_open",
}: {
  assignments?: NonNullable<
    KalakritiEditionAccess["membership"]
  >["assignments"];
  isGlobalAdmin?: boolean;
  kind?: "guardian" | "volunteer";
  lifecycle?: KalakritiEditionAccess["edition"]["lifecycle"];
} = {}): KalakritiEditionAccess {
  return {
    edition: { lifecycle } as KalakritiEditionAccess["edition"],
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

describe("Kalakriti registration scope policy", () => {
  it("gives global and Edition administrators one complete scope", () => {
    expect(
      resolveKalakritiRegistrationScopes(access({ isGlobalAdmin: true }))
    ).toEqual([{ kind: "edition" }]);
    expect(
      resolveKalakritiRegistrationScopes(
        access({ assignments: [assignment("edition_admin")] })
      )
    ).toEqual([{ kind: "edition" }]);
  });

  it("combines and deduplicates Guardian and Liaison Centers", () => {
    expect(
      resolveKalakritiRegistrationScopes(
        access({
          assignments: [
            assignment("liaison", { centerId: "center-2" }),
            assignment("liaison", { centerId: "center-1" }),
          ],
          kind: "guardian",
        }),
        ["center-2", "center-3"]
      )
    ).toEqual([
      {
        centerIds: ["center-1", "center-2", "center-3"],
        kind: "center",
      },
    ]);
  });

  it("keeps mixed category and competition assignments separate", () => {
    expect(
      resolveKalakritiRegistrationScopes(
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
      )
    ).toEqual([
      {
        competitionCategoryIds: ["category-1"],
        kind: "competition_category",
      },
      { competitionIds: ["competition-1"], kind: "competition" },
    ]);
  });

  it("lets the Overall Events Lead see every category", () => {
    expect(
      resolveKalakritiRegistrationScopes(
        access({ assignments: [assignment("overall_events_lead")] })
      )
    ).toEqual([{ competitionCategoryIds: null, kind: "competition_category" }]);
  });

  it("does not grant scopes to unrelated roles or archived members", () => {
    expect(
      resolveKalakritiRegistrationScopes(
        access({ assignments: [assignment("competition_volunteer")] })
      )
    ).toEqual([]);
    expect(
      resolveKalakritiRegistrationScopes(
        access({
          assignments: [assignment("edition_admin")],
          lifecycle: "archived",
        })
      )
    ).toEqual([]);
  });
});
