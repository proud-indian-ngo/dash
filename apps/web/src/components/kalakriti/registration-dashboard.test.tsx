import { describe, expect, it, mock } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { KalakritiRegistrationDashboardProjection } from "@/lib/server/kalakriti-registration-dashboard";

mock.module("@rocicorp/zero/react", () => ({
  useZero: () => ({}),
  useQuery: () => [[], { type: "complete" }],
}));
mock.module("@/components/data-table/data-table-wrapper", () => ({
  DataTableWrapper: () => null,
}));

const { RegistrationDashboard } = await import("./registration-dashboard");

function projection(
  scope: KalakritiRegistrationDashboardProjection["scope"]
): KalakritiRegistrationDashboardProjection {
  return {
    scope,
    totals: {
      students: 2,
      registeredStudents: 1,
      entries: 1,
      participants: 1,
      studentLimit: null,
    },
    centers: [],
    ageCategories: [],
    competitionCategories: [],
    competitions: [],
  };
}

describe("RegistrationDashboard", () => {
  it("labels each scope with a unique heading and keeps breakdowns collapsed", () => {
    const html = renderToStaticMarkup(
      <RegistrationDashboard
        editionId="edition"
        projections={[
          projection({ kind: "edition" }),
          projection({ kind: "competition", competitionIds: ["competition"] }),
        ]}
        year={2026}
      />
    );
    const headingIds = [...html.matchAll(/<h2 id="([^"]+)"/g)].map(
      (match) => match[1]
    );
    expect(headingIds).toHaveLength(2);
    expect(new Set(headingIds).size).toBe(2);
    expect(html).toContain("Edition overview");
    expect(html).toContain("Your competitions");
    expect(html).not.toContain("Registration breakdown");
  });
});
