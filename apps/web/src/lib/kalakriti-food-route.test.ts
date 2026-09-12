import { describe, expect, it } from "bun:test";

import { Route } from "@/routes/_app/kalakriti/$year/food";

function runBeforeLoad(access: unknown) {
  const { beforeLoad } = Route.options;
  if (!beforeLoad) throw new Error("Food page guard is missing");
  return beforeLoad({
    context: { kalakritiEditionAccess: access },
  } as Parameters<typeof beforeLoad>[0]);
}

describe("Food page guard", () => {
  it("rejects direct URLs from unrelated staff or absent access", () => {
    expect(() => runBeforeLoad(null)).toThrow();
    expect(() =>
      runBeforeLoad({
        isGlobalAdmin: false,
        membership: {
          kind: "volunteer",
          assignments: [
            { responsibility: "hospitality_member", centerId: null },
          ],
        },
      })
    ).toThrow();
  });
  it("admits Food staff and scoped read-only people", () => {
    expect(() =>
      runBeforeLoad({ isGlobalAdmin: true, membership: null })
    ).not.toThrow();
    expect(() =>
      runBeforeLoad({
        isGlobalAdmin: false,
        membership: { kind: "guardian", assignments: [] },
      })
    ).not.toThrow();
    for (const [responsibility, centerId] of [
      ["food_member", null],
      ["liaison_lead", null],
      ["liaison", "center-a"],
    ]) {
      expect(() =>
        runBeforeLoad({
          isGlobalAdmin: false,
          membership: {
            kind: "volunteer",
            assignments: [{ responsibility, centerId }],
          },
        })
      ).not.toThrow();
    }
  });
});
