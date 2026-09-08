import { mock } from "bun:test";

/** Exercise the real promotion helper without a database or module mocks. */
export function createOrientationSql(promoted = false) {
  const returning = mock(async () => (promoted ? [{ id: "volunteer-1" }] : []));
  const deleteWhere = mock(async () => undefined);
  const query = {
    from: (..._args: unknown[]) => query,
    innerJoin: (..._args: unknown[]) => query,
    where: (..._args: unknown[]) => query,
    getSQL: () => ({ queryChunks: [] }),
  };
  return {
    deleteWhere,
    returning,
    transaction: {
      delete: mock(() => ({ where: deleteWhere })),
      select: mock(() => query),
      update: mock(() => ({
        set: mock(() => ({ where: mock(() => ({ returning })) })),
      })),
    },
  };
}
