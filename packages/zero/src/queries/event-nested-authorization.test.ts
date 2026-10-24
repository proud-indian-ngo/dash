import { describe, expect, it } from "bun:test";

import type { Context } from "../context";
import { eventInterestQueries } from "./event-interest";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "./query-scope-test-utils";
import { reimbursementQueries } from "./reimbursement";
import { teamEventQueries } from "./team-event";
import { vendorPaymentQueries } from "./vendor-payment";

// Failure cases: public roots leaking other people's interest; a public series
// leaking private children; a forged expense relation granting event access;
// stale leadership/membership retaining access; finance and programme leads
// losing legitimate summaries because they have no events permission.
const viewer = (
  permissions = ["events.view_own"],
  role = "volunteer"
): Context => ({ permissions, role, userId: "viewer" });
const publicEvent = {
  id: "public",
  isPublic: true,
  teamId: "team",
  programmeId: "programme",
};
const privateEvent = { ...publicEvent, id: "private", isPublic: false };
const tables = (): ScopeTables => ({
  teamEvent: [publicEvent, privateEvent],
  team: [{ id: "team" }],
  teamMember: [],
  teamEventMember: [],
  programme: [{ id: "programme", leadUserId: "other" }],
});
function ast(query: unknown): ScopeAst {
  return (query as { ast: ScopeAst }).ast;
}
function relation(query: ScopeAst, name: string): ScopeAst {
  const child = query.related?.find((r) => r.subquery.alias === name)?.subquery;
  if (!child) throw new Error(`Missing relation ${name}`);
  return child;
}
function allowed(query: ScopeAst, rows: ScopeRow[], data: ScopeTables) {
  return rows
    .filter((row) => matchesScope(row, query.where, data))
    .map((row) => row.id);
}
function eventQueries(ctx: Context) {
  return [
    teamEventQueries.allAccessible.fn({ args: undefined, ctx }),
    teamEventQueries.byCurrentUser.fn({ args: undefined, ctx }),
    teamEventQueries.byCurrentUserAll.fn({ args: undefined, ctx }),
    teamEventQueries.byId.fn({ args: { id: "public" }, ctx }),
    teamEventQueries.byIdWithExpenses.fn({ args: { id: "public" }, ctx }),
    teamEventQueries.byTeam.fn({ args: { teamId: "team" }, ctx }),
  ].map(ast);
}

describe("nested interest privacy", () => {
  const interests = [
    { id: "own", eventId: "public", userId: "viewer" },
    { id: "other", eventId: "public", userId: "other" },
  ];
  it("returns only the owner's interest for ordinary and unoriented viewers", () => {
    for (const role of ["volunteer", "unoriented_volunteer", "external_user"]) {
      for (const query of eventQueries(viewer(["events.view_own"], role))) {
        expect(
          allowed(relation(query, "interests"), interests, tables())
        ).toEqual(["own"]);
      }
    }
  });
  it("allows global reviewers and team leads, and reacts to leadership revocation", () => {
    for (const query of eventQueries(
      viewer(["events.view_own", "events.manage_interest"])
    )) {
      expect(
        allowed(relation(query, "interests"), interests, tables())
      ).toEqual(["own", "other"]);
    }
    const data = tables();
    data.teamMember = [{ teamId: "team", userId: "viewer", role: "lead" }];
    for (const query of eventQueries(viewer())) {
      const scope = relation(query, "interests");
      expect(allowed(scope, interests, data)).toEqual(["own", "other"]);
      data.teamMember[0]!.role = "member";
      expect(allowed(scope, interests, data)).toEqual(["own"]);
      data.teamMember[0]!.role = "lead";
    }
    const direct = ast(
      eventInterestQueries.managerByEvent.fn({
        args: { eventId: "public" },
        ctx: viewer(),
      })
    );
    expect(allowed(direct, interests, data)).toEqual(["own", "other"]);
    data.teamMember = [];
    expect(allowed(direct, interests, data)).toEqual([]);
  });
});

describe("each series child has its own event scope", () => {
  it("denies private children until membership grants access, then removes revoked access", () => {
    const data = tables();
    const queries = [
      ...eventQueries(viewer()),
      ast(teamEventQueries.public.fn({ args: undefined, ctx: viewer() })),
    ];
    for (const query of queries) {
      const scope = relation(query, "exceptions");
      expect(allowed(scope, [publicEvent, privateEvent], data)).toEqual([
        "public",
      ]);
      data.teamEventMember = [{ eventId: "private", userId: "viewer" }];
      expect(allowed(scope, [privateEvent], data)).toEqual(["private"]);
      data.teamEventMember = [];
      expect(allowed(scope, [privateEvent], data)).toEqual([]);
    }
  });
  it("preserves global event viewing", () => {
    for (const query of eventQueries(viewer(["events.view_all"]))) {
      expect(
        allowed(relation(query, "exceptions"), [privateEvent], tables())
      ).toEqual(["private"]);
    }
  });
});

for (const [name, queries] of Object.entries({
  reimbursement: reimbursementQueries,
  vendorPayment: vendorPaymentQueries,
})) {
  describe(`${name} event summaries`, () => {
    function expenseQueries(ctx: Context) {
      return [
        queries.all.fn({ args: undefined, ctx }),
        queries.byId.fn({ args: { id: "request" }, ctx }),
        queries.byCurrentUser.fn({ args: undefined, ctx }),
      ].map(ast);
    }
    it("never turns an own request into access to an unrelated private event", () => {
      for (const query of expenseQueries(viewer())) {
        expect(
          allowed(relation(query, "event"), [privateEvent], tables())
        ).toEqual([]);
      }
    });
    it("keeps own request summaries without events permission for public or joined events", () => {
      const data = tables();
      for (const query of expenseQueries(viewer([]))) {
        const scope = relation(query, "event");
        expect(allowed(scope, [publicEvent], data)).toEqual(["public"]);
        data.teamEventMember = [{ eventId: "private", userId: "viewer" }];
        expect(allowed(scope, [privateEvent], data)).toEqual(["private"]);
        data.teamEventMember = [];
        expect(allowed(scope, [privateEvent], data)).toEqual([]);
      }
    });
    it("keeps finance and programme lead summaries, with reactive lead revocation", () => {
      const data = tables();
      for (const query of expenseQueries(viewer(["requests.view_all"]))) {
        expect(allowed(relation(query, "event"), [privateEvent], data)).toEqual(
          ["private"]
        );
      }
      for (const query of expenseQueries(viewer([]))) {
        const scope = relation(query, "event");
        data.programme![0]!.leadUserId = "viewer";
        expect(allowed(scope, [privateEvent], data)).toEqual(["private"]);
        expect(scope.related?.map((r) => r.subquery.alias) ?? []).not.toContain(
          "members"
        );
        data.programme![0]!.leadUserId = "other";
        expect(allowed(scope, [privateEvent], data)).toEqual([]);
      }
    });
  });
}
