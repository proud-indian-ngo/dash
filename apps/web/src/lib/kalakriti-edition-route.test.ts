import { beforeEach, describe, expect, it, vi } from "vitest";

const getKalakritiEditionAccess = vi.hoisted(() => vi.fn());

vi.mock("@/functions/kalakriti-access", () => ({
  getKalakritiEditionAccess,
}));
vi.mock("@pi-dash/design-system/components/ui/badge", () => ({
  Badge: () => null,
}));
vi.mock("@pi-dash/design-system/components/ui/button", () => ({
  Button: () => null,
}));

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { Route } from "@/routes/_app/kalakriti/$year/route";

const edition = {
  ageCutoffDate: "2027-01-01",
  eventDate: "2027-12-01",
  id: "019f0000-0000-7000-8000-000000000001",
  lifecycle: "draft" as const,
  name: "Kalakriti 2027",
  plannedRegistrationCloseAt: Date.UTC(2027, 10, 20),
  teamEventId: "019f0000-0000-7000-8000-000000000002",
  timezone: "Asia/Kolkata",
  year: 2027,
};

function runBeforeLoad(year = "2027") {
  const { beforeLoad } = Route.options;
  if (!beforeLoad) {
    throw new Error("Edition route guard is missing");
  }
  return beforeLoad({ params: { year } } as Parameters<typeof beforeLoad>[0]);
}

describe("Kalakriti Edition route guard", () => {
  beforeEach(() => {
    getKalakritiEditionAccess.mockReset();
  });

  it("allows a global administrator for the exact year", async () => {
    const access: KalakritiEditionAccess = {
      edition,
      isGlobalAdmin: true,
      membership: null,
    };
    getKalakritiEditionAccess.mockResolvedValue(access);

    await expect(runBeforeLoad()).resolves.toEqual({
      kalakritiEditionAccess: access,
    });
    expect(getKalakritiEditionAccess).toHaveBeenCalledWith({
      data: { year: 2027 },
    });
  });

  it("allows an actively assigned user", async () => {
    const access: KalakritiEditionAccess = {
      edition,
      isGlobalAdmin: false,
      membership: {
        id: "019f0000-0000-7000-8000-000000000003",
        kind: "guardian",
        responsibilities: [],
      },
    };
    getKalakritiEditionAccess.mockResolvedValue(access);

    await expect(runBeforeLoad()).resolves.toEqual({
      kalakritiEditionAccess: access,
    });
  });

  it("rejects a different or missing year instead of falling back", async () => {
    getKalakritiEditionAccess.mockResolvedValue(null);

    await expect(runBeforeLoad("2026")).rejects.toMatchObject({
      isNotFound: true,
    });
    expect(getKalakritiEditionAccess).toHaveBeenCalledWith({
      data: { year: 2026 },
    });
  });

  it("rejects an archived membership", async () => {
    getKalakritiEditionAccess.mockResolvedValue(null);

    await expect(runBeforeLoad()).rejects.toMatchObject({ isNotFound: true });
  });

  it("rejects a user with no accessible Edition", async () => {
    getKalakritiEditionAccess.mockResolvedValue(null);

    await expect(runBeforeLoad()).rejects.toMatchObject({ isNotFound: true });
  });

  it("rejects a malformed year before querying access", async () => {
    await expect(runBeforeLoad("latest")).rejects.toMatchObject({
      isNotFound: true,
    });
    expect(getKalakritiEditionAccess).not.toHaveBeenCalled();
  });
});
