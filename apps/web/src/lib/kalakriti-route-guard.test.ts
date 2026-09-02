import { beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();

const getCurrentKalakritiEditionAccess = hoisted(() => mock());

mock.module("@/functions/kalakriti-access", () => ({
  getCurrentKalakritiEditionAccess,
}));

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
  beforeEach(() => {
    getCurrentKalakritiEditionAccess.mockReset();
  });

  it("allows users with coarse Kalakriti access", async () => {
    await expect(runBeforeLoad(["kalakriti.view"])).resolves.toBeUndefined();
    expect(getCurrentKalakritiEditionAccess).not.toHaveBeenCalled();
  });

  it("allows global Kalakriti administrators without coarse view", async () => {
    await expect(runBeforeLoad(["kalakriti.admin"])).resolves.toBeUndefined();
    expect(getCurrentKalakritiEditionAccess).not.toHaveBeenCalled();
  });

  it("allows assigned members without coarse Kalakriti access", async () => {
    getCurrentKalakritiEditionAccess.mockResolvedValue({
      edition: { year: 2027 },
      isGlobalAdmin: false,
      membership: { responsibilities: ["volunteer_coordinator"] },
    });

    await expect(runBeforeLoad([])).resolves.toBeUndefined();
    expect(getCurrentKalakritiEditionAccess).toHaveBeenCalledTimes(1);
  });

  it("redirects users without Kalakriti access or an Edition assignment", async () => {
    getCurrentKalakritiEditionAccess.mockResolvedValue(null);

    await expect(runBeforeLoad([])).rejects.toThrow();
    expect(getCurrentKalakritiEditionAccess).toHaveBeenCalledTimes(1);
  });
});
