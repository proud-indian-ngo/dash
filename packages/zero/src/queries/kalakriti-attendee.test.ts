import { describe, expect, it } from "bun:test";

import { kalakritiAttendeeQueries } from "./kalakriti-attendee";
import {
  matchesScope,
  type ScopeAst,
  type ScopeTables,
} from "./query-scope-test-utils";

function fixture(
  responsibility: string,
  kind: "guest" | "judge" = "judge",
  permissions: string[] = []
) {
  const attendee = {
    id: "attendee",
    editionId: "edition",
    kind,
    archivedAt: null,
  };
  const tables: ScopeTables = {
    kalakritiAttendee: [attendee],
    kalakritiEdition: [{ id: "edition", lifecycle: "live" }],
    kalakritiEditionMembership: [
      {
        id: "membership",
        editionId: "edition",
        userId: "viewer",
        state: "active",
        kind: "volunteer",
      },
    ],
    kalakritiAssignment: [
      {
        id: "role",
        editionId: "edition",
        membershipId: "membership",
        responsibility,
        competitionId: "competition",
        competitionCategoryId: "category",
      },
    ],
    kalakritiCompetition: [
      {
        id: "competition",
        editionId: "edition",
        competitionCategoryId: "category",
      },
      {
        id: "unrelated",
        editionId: "edition",
        competitionCategoryId: "unrelated-category",
      },
    ],
    kalakritiCompetitionCategory: [
      { id: "category", editionId: "edition" },
      { id: "unrelated-category", editionId: "edition" },
    ],
    kalakritiJudgeAssignment: [
      {
        id: "link",
        editionId: "edition",
        attendeeId: "attendee",
        competitionId: "competition",
      },
      {
        id: "unrelated-link",
        editionId: "edition",
        attendeeId: "attendee",
        competitionId: "unrelated",
      },
    ],
  };
  const query = kalakritiAttendeeQueries.visible.fn({
    args: { editionId: "edition", kind },
    ctx: { userId: "viewer", permissions, role: "volunteer" },
  }) as unknown as { ast: ScopeAst };
  return { attendee, tables, ast: query.ast };
}

describe("attendee roster scope", () => {
  it.each([
    "edition_admin",
    "volunteer_coordinator",
    "volunteer_management_volunteer",
    "hospitality_lead",
    "hospitality_member",
  ])("allows %s both rosters", (responsibility) => {
    for (const kind of ["guest", "judge"] as const) {
      const f = fixture(responsibility, kind);
      expect(matchesScope(f.attendee, f.ast.where, f.tables)).toBe(true);
    }
  });
  it.each(["hospitality_lead", "hospitality_member"])(
    "limits %s to active membership and the assigned Edition",
    (responsibility) => {
      for (const kind of ["guest", "judge"] as const) {
        const f = fixture(responsibility, kind);
        const nested = f.ast.related?.find(
          (row) => row.subquery.table === "kalakritiJudgeAssignment"
        )?.subquery;
        for (const assignment of f.tables.kalakritiJudgeAssignment ?? []) {
          expect(matchesScope(assignment, nested?.where, f.tables)).toBe(true);
        }
        f.tables.kalakritiEditionMembership![0]!.state = "archived";
        expect(matchesScope(f.attendee, f.ast.where, f.tables)).toBe(false);
        f.tables.kalakritiEditionMembership![0]!.state = "active";
        f.tables.kalakritiAssignment![0]!.editionId = "other";
        expect(matchesScope(f.attendee, f.ast.where, f.tables)).toBe(false);
        f.tables.kalakritiAssignment![0]!.editionId = "edition";
        f.tables.kalakritiEdition![0]!.lifecycle = "archived";
        expect(matchesScope(f.attendee, f.ast.where, f.tables)).toBe(false);
        f.tables.kalakritiEdition![0]!.lifecycle = "live";
        f.tables.kalakritiAssignment = [];
        expect(matchesScope(f.attendee, f.ast.where, f.tables)).toBe(false);
      }
    }
  );
  it.each([
    "overall_events_lead",
    "competition_category_lead",
    "competition_coordinator",
  ])("allows %s judges only", (responsibility) => {
    const judge = fixture(responsibility);
    const guest = fixture(responsibility, "guest");
    expect(matchesScope(judge.attendee, judge.ast.where, judge.tables)).toBe(
      true
    );
    expect(matchesScope(guest.attendee, guest.ast.where, guest.tables)).toBe(
      false
    );
  });
  it("allows Hospitality Leads to see both rosters within their Edition", () => {
    const guest = fixture("hospitality_lead", "guest");
    const judge = fixture("hospitality_lead", "judge");
    expect(matchesScope(guest.attendee, guest.ast.where, guest.tables)).toBe(
      true
    );
    expect(matchesScope(judge.attendee, judge.ast.where, judge.tables)).toBe(
      true
    );
    guest.tables.kalakritiEditionMembership![0]!.state = "archived";
    expect(matchesScope(guest.attendee, guest.ast.where, guest.tables)).toBe(
      false
    );
    guest.tables.kalakritiEditionMembership![0]!.state = "active";
    guest.tables.kalakritiAssignment![0]!.editionId = "other";
    expect(matchesScope(guest.attendee, guest.ast.where, guest.tables)).toBe(
      false
    );
    guest.tables.kalakritiAssignment![0]!.editionId = "edition";
    guest.tables.kalakritiEditionMembership![0]!.kind = "guardian";
    expect(matchesScope(guest.attendee, guest.ast.where, guest.tables)).toBe(
      false
    );
  });
  it.each(["food_lead", "food_member", "competition_volunteer", "guardian"])(
    "denies %s access to contact-bearing rows",
    (responsibility) => {
      const f = fixture(responsibility);
      expect(matchesScope(f.attendee, f.ast.where, f.tables)).toBe(false);
    }
  );
  it.each(["competition_category_lead", "competition_coordinator"])(
    "filters nested assignments and denies judges without matching scope for %s",
    (responsibility) => {
      const f = fixture(responsibility);
      const related = f.ast.related?.find(
        (row) => row.subquery.table === "kalakritiJudgeAssignment"
      )?.subquery;
      expect(related).toBeDefined();
      expect(
        matchesScope(
          f.tables.kalakritiJudgeAssignment![0]!,
          related?.where,
          f.tables
        )
      ).toBe(true);
      expect(
        matchesScope(
          f.tables.kalakritiJudgeAssignment![1]!,
          related?.where,
          f.tables
        )
      ).toBe(false);
      f.tables.kalakritiJudgeAssignment = [
        f.tables.kalakritiJudgeAssignment![1]!,
      ];
      expect(matchesScope(f.attendee, f.ast.where, f.tables)).toBe(false);
    }
  );
  it("denies archived memberships and cross-Edition assignments", () => {
    const f = fixture("edition_admin");
    f.tables.kalakritiEditionMembership![0]!.state = "archived";
    expect(matchesScope(f.attendee, f.ast.where, f.tables)).toBe(false);
    f.tables.kalakritiEditionMembership![0]!.state = "active";
    f.tables.kalakritiAssignment![0]!.editionId = "other";
    expect(matchesScope(f.attendee, f.ast.where, f.tables)).toBe(false);
  });
  it("allows only global admins to read archived Editions", () => {
    for (const permissions of [[], ["kalakriti.admin"]]) {
      const f = fixture("edition_admin", "guest", permissions);
      f.tables.kalakritiEdition![0]!.lifecycle = "archived";
      expect(matchesScope(f.attendee, f.ast.where, f.tables)).toBe(
        permissions.length > 0
      );
    }
  });
});
