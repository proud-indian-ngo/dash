import { describe, expect, it } from "vitest";
import { Route } from "./route";

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
  it("allows Kalakriti administrators", () => {
    expect(() => runBeforeLoad(["kalakriti.admin"])).not.toThrow();
  });

  it("redirects users without administration permission", () => {
    expect(() => runBeforeLoad(["kalakriti.view"])).toThrow();
  });
});
