import { beforeEach, describe, expect, it, mock } from "bun:test";

const resolvePermissions = mock(async () => [] as string[]);
const resolveKalakritiEditionAccess = mock(async () => null as unknown);
const getKalakritiCompetitionStatusesForAccess = mock(async () => [
  { divisionId: "division-1", status: "running" },
]);

mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions,
}));
mock.module("@/lib/server/kalakriti-edition-access", () => ({
  resolveKalakritiEditionAccess,
}));
mock.module("@/lib/server/kalakriti-competition-status", () => ({
  getKalakritiCompetitionStatusesForAccess,
}));
mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: () => ({ handler: (handler: unknown) => handler }),
    }),
  }),
}));

const { getKalakritiCompetitionStatuses } =
  await import("./kalakriti-competition-status");
const run = (session: unknown = { user: { id: "actor", role: "custom" } }) =>
  (
    getKalakritiCompetitionStatuses as unknown as (
      input: unknown
    ) => Promise<unknown>
  )({ context: { session }, data: { year: 2027 } });

beforeEach(() => {
  resolvePermissions.mockReset();
  resolveKalakritiEditionAccess.mockReset();
  getKalakritiCompetitionStatusesForAccess.mockReset();
});

describe("Competition status server authorization", () => {
  it("returns no statuses without a session", async () => {
    expect(await run(null)).toBeNull();
    expect(resolvePermissions).not.toHaveBeenCalled();
    expect(resolveKalakritiEditionAccess).not.toHaveBeenCalled();
  });

  it("denies a role without Kalakriti view permission before reading Edition access", async () => {
    resolvePermissions.mockResolvedValue([]);
    expect(await run()).toBeNull();
    expect(resolveKalakritiEditionAccess).not.toHaveBeenCalled();
    expect(getKalakritiCompetitionStatusesForAccess).not.toHaveBeenCalled();
  });

  it("denies users without Edition access", async () => {
    resolvePermissions.mockResolvedValue(["kalakriti.view"]);
    resolveKalakritiEditionAccess.mockResolvedValue(null);
    expect(await run()).toBeNull();
    expect(getKalakritiCompetitionStatusesForAccess).not.toHaveBeenCalled();
  });

  it.each(["kalakriti.view", "kalakriti.admin"])(
    "returns only scoped statuses for %s",
    async (permission) => {
      const access = { edition: { id: "edition-1" } };
      resolvePermissions.mockResolvedValue([permission]);
      resolveKalakritiEditionAccess.mockResolvedValue(access);
      getKalakritiCompetitionStatusesForAccess.mockResolvedValue([
        { divisionId: "division-1", status: "running" },
      ]);

      expect(await run()).toEqual([
        { divisionId: "division-1", status: "running" },
      ]);
      expect(resolveKalakritiEditionAccess).toHaveBeenCalledWith({
        role: "custom",
        userId: "actor",
        year: 2027,
      });
      expect(getKalakritiCompetitionStatusesForAccess).toHaveBeenCalledWith(
        access
      );
    }
  );
});
