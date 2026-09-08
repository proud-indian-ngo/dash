import { mock } from "bun:test";

/** Exercise the real promotion helper without a database or module mocks. */
export function createOrientationSql(promoted = false) {
  const returning = mock(async () => (promoted ? [{ id: "volunteer-1" }] : []));
  const deleteWhere = mock(async () => undefined);
  const lockEdition = mock(async () => [
    {
      ageCutoffDate: "2027-06-30",
      eventDate: "2027-11-21",
      id: "edition-1",
      lifecycle: "draft",
      minTotalCompetitions: 1,
      nextStudentSequence: 1,
      timezone: "Asia/Kolkata",
      nextVolunteerSequence: 1,
      teamEventId: "event-1",
      year: 2027,
    },
  ]);
  const query = {
    for: lockEdition,
    from: (..._args: unknown[]) => query,
    innerJoin: (..._args: unknown[]) => query,
    where: (..._args: unknown[]) => query,
    getSQL: () => ({ queryChunks: [] }),
  };
  return {
    deleteWhere,
    lockEdition,
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
