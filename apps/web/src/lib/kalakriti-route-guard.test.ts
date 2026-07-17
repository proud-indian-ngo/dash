import { describe, expect, it } from "vitest";
import { Route } from "@/routes/_app/kalakriti/route";

function runBeforeLoad(permissions: string[]) {
  const { beforeLoad } = Route.options;
  if (!beforeLoad) {
    throw new Error("Kalakriti route guard is missing");
  }
  return beforeLoad({
    context: { permissions },
  } as Parameters<typeof beforeLoad>[0]);
}

describe("Kalakriti route guard", () => {
  it("allows users with coarse Kalakriti access", () => {
    expect(() => runBeforeLoad(["kalakriti.view"])).not.toThrow();
  });

  it("redirects users without Kalakriti access", () => {
    expect(() => runBeforeLoad([])).toThrow();
  });
});
