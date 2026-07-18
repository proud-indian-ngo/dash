import type { KalakritiResponsibility } from "@pi-dash/shared/kalakriti";
import { describe, expect, it } from "vitest";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import {
  resolveKalakritiAuditScope,
  sanitizeKalakritiAuditMetadata,
} from "./kalakriti-audit-policy";

function access(
  responsibilities: KalakritiResponsibility[],
  assignments: NonNullable<
    KalakritiEditionAccess["membership"]
  >["assignments"] = []
): KalakritiEditionAccess {
  return {
    edition: {} as KalakritiEditionAccess["edition"],
    isGlobalAdmin: false,
    membership: {
      assignments,
      id: "membership-1",
      kind: "volunteer",
      responsibilities,
    },
  };
}

describe("Kalakriti audit policy", () => {
  it("gives Edition administrators the complete Edition log", () => {
    expect(resolveKalakritiAuditScope(access(["edition_admin"]))).toMatchObject(
      {
        fullEdition: true,
      }
    );
  });

  it("limits Category Leads to their assigned categories and event domains", () => {
    expect(
      resolveKalakritiAuditScope(
        access(
          ["competition_category_lead"],
          [
            {
              centerId: null,
              competitionCategoryId: "category-1",
              competitionId: null,
              responsibility: "competition_category_lead",
            },
          ]
        )
      )
    ).toEqual({
      categoryScopedDomains: [
        "competition_configuration",
        "schedule_configuration",
      ],
      competitionCategoryIds: ["category-1"],
      domains: ["competition_configuration", "schedule_configuration"],
      fullEdition: false,
    });
  });

  it("does not expose an audit view to ordinary assigned members", () => {
    expect(resolveKalakritiAuditScope(access(["liaison"]))).toBeNull();
  });

  it("removes private Student profile fields from legacy metadata", () => {
    expect(
      sanitizeKalakritiAuditMetadata({
        after: {
          ageCategoryId: "age-2",
          dateOfBirth: "2014-01-02",
          gender: "female",
          name: "Private name",
        },
        centerId: "center-1",
        dateOfBirth: "2014-01-02",
        gender: "female",
        humanId: "KAL-2027-0001",
        name: "Private name",
      })
    ).toEqual({
      after: { ageCategoryId: "age-2" },
      centerId: "center-1",
      humanId: "KAL-2027-0001",
    });
  });
});
