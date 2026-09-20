import { describe, expect, it } from "bun:test";

import { Route } from "@/routes/_app/kalakriti/$year/awards";

function access(
  responsibility: string,
  lifecycle = "live",
  isGlobalAdmin = false,
  state = "active"
) {
  return {
    edition: { lifecycle },
    isGlobalAdmin,
    membership: {
      assignments: [{ responsibility }],
      kind: "volunteer",
      state,
    },
  };
}

function guard(actor: ReturnType<typeof access> | null) {
  const beforeLoad = Route.options.beforeLoad;
  if (!beforeLoad) throw new Error("Awards route guard missing");
  return beforeLoad({
    context: { kalakritiEditionAccess: actor },
  } as unknown as Parameters<typeof beforeLoad>[0]);
}

describe("Kalakriti Awards access", () => {
  it.each(["edition_admin", "awards_lead", "awards_member"])(
    "admits active %s access",
    (responsibility) => {
      expect(() => guard(access(responsibility))).not.toThrow();
    }
  );

  it("rejects unrelated, inactive and missing access", () => {
    expect(() => guard(null)).toThrow();
    expect(() => guard(access("food_member"))).toThrow();
    expect(() =>
      guard(access("awards_lead", "live", false, "inactive"))
    ).toThrow();
  });

  it("keeps archived Awards read-only for global administrators", () => {
    expect(() => guard(access("awards_lead", "archived"))).toThrow();
    expect(() => guard(access("", "archived", true))).not.toThrow();
  });
});
