import { describe, expect, it, mock } from "bun:test";

import { queries } from "@pi-dash/zero/queries";
import type { Zero } from "@rocicorp/zero";

mock.module("@pi-dash/env/web", () => ({
  env: { VITE_APP_NAME: "Proud Indian Dashboard" },
}));

const { Route: DeclarationsRoute } =
  await import("@/routes/_app/governance/declarations");
const { Route: MeetingsRoute } =
  await import("@/routes/_app/governance/meetings/index");
const { Route: PoliciesRoute } =
  await import("@/routes/_app/governance/policies");
const { Route: ResolutionRoute } =
  await import("@/routes/_app/governance/resolutions/$resolutionId");
const { Route: CircularRoute } =
  await import("@/routes/_app/governance/resolutions/circulars/$circularId");
const { Route: ResolutionsRoute } =
  await import("@/routes/_app/governance/resolutions/index");

type RouteWithLoader = {
  options: {
    loader?: unknown;
  };
};

function queryKey(query: unknown): string {
  const request = query as {
    args?: unknown;
    query: { queryName: string };
  };
  return JSON.stringify({ args: request.args, name: request.query.queryName });
}

function preloadKeys(
  route: RouteWithLoader,
  permissions: string[],
  params: Record<string, string> = {}
): string[] {
  const loader = route.options.loader;
  if (typeof loader !== "function") {
    throw new Error("Governance route loader is missing");
  }
  const preload = mock((_query: unknown) => ({
    cleanup: () => {},
    complete: Promise.resolve(),
  }));
  (loader as (input: never) => unknown)({
    abortController: new AbortController(),
    context: { permissions, zero: { preload } as unknown as Zero },
    params,
  } as never);
  return preload.mock.calls.map(([query]) => queryKey(query));
}

describe.each([
  [
    "resolutions",
    ResolutionsRoute,
    queries.resolution.all(),
    queries.resolution.mine(),
  ],
  ["meetings", MeetingsRoute, queries.meeting.all(), queries.meeting.mine()],
] as const)("%s list route preload", (_name, route, all, mine) => {
  it.each(["governance.view", "governance.manage"])(
    "preloads the full list for %s",
    (permission) => {
      expect(preloadKeys(route, [permission])).toEqual([queryKey(all)]);
    }
  );

  it("preloads only the signed-in trustee's list without governance access", () => {
    expect(preloadKeys(route, [])).toEqual([queryKey(mine)]);
  });
});

describe("declarations route preload", () => {
  const personal = [
    queryKey(queries.trustee.me()),
    queryKey(queries.conflictDeclaration.mine()),
  ];
  const full = [
    queryKey(queries.trustee.all()),
    queryKey(queries.deedVersion.all()),
    queryKey(queries.conflictDeclaration.all()),
  ];

  it.each(["governance.view", "governance.manage"])(
    "keeps personal data and adds the full register for %s",
    (permission) => {
      expect(preloadKeys(DeclarationsRoute, [permission]).sort()).toEqual(
        [...personal, ...full].sort()
      );
    }
  );

  it("preloads only personal trustee and declaration data without governance access", () => {
    expect(preloadKeys(DeclarationsRoute, []).sort()).toEqual(
      [...personal].sort()
    );
  });
});

describe("governance detail route preloads", () => {
  it("preloads the requested resolution", () => {
    const resolutionId = "resolution-17";
    expect(preloadKeys(ResolutionRoute, [], { resolutionId })).toEqual([
      queryKey(queries.resolution.byId({ id: resolutionId })),
    ]);
  });

  it("preloads the requested circular", () => {
    const circularId = "circular-23";
    expect(preloadKeys(CircularRoute, [], { circularId })).toEqual([
      queryKey(queries.circular.byId({ id: circularId })),
    ]);
  });

  it("preloads the policies already shared with the root policy gate", () => {
    expect(preloadKeys(PoliciesRoute, ["governance.view"])).toEqual([
      queryKey(queries.policy.all()),
    ]);
  });
});
