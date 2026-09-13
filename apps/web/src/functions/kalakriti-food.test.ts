import { describe, expect, it, mock } from "bun:test";

let access: unknown;
let calls: { columns: Record<string, unknown>; where?: unknown }[] = [];
let results: unknown[][] = [];
mock.module("@pi-dash/db", () => ({
  db: {
    select: (columns: Record<string, unknown>) => {
      const call = { columns, where: undefined as unknown };
      calls.push(call);
      return {
        from: () => ({
          where: (where: unknown) => {
            call.where = where;
            return Promise.resolve(results.shift() ?? []);
          },
        }),
      };
    },
  },
}));
mock.module("@/lib/server/kalakriti-edition-access", () => ({
  resolveKalakritiEditionAccess: () => Promise.resolve(access),
}));
mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: () => ({ handler: (handler: unknown) => handler }),
    }),
  }),
}));
const { getKalakritiFoodAttendees } = await import("./kalakriti-food");
const run = (session: unknown = { user: { id: "actor", role: "volunteer" } }) =>
  (
    getKalakritiFoodAttendees as unknown as (
      input: unknown
    ) => Promise<unknown[]>
  )({ context: { session }, data: { year: 2026 } });
const scoped = (responsibility: string, lifecycle = "live") => ({
  isGlobalAdmin: false,
  edition: { id: "edition", lifecycle },
  membership: {
    kind: "volunteer",
    assignments: [{ responsibility, centerId: null }],
  },
});

describe("Food attendee server projection", () => {
  it.each([
    "liaison",
    "liaison_lead",
    "center_liaison_lead",
    "hospitality_member",
    "transport_lead",
  ])("never reads attendees for %s", async (role) => {
    access = scoped(role);
    calls = [];
    expect(await run()).toEqual([]);
    expect(calls).toHaveLength(0);
  });
  it("denies anonymous, Guardian and archived Edition readers", async () => {
    await expect(run(null)).rejects.toThrow("Unauthorized");
    for (const denied of [
      null,
      {
        ...scoped("food_lead"),
        membership: { kind: "guardian", assignments: [] },
      },
      scoped("food_lead", "archived"),
    ]) {
      access = denied;
      calls = [];
      expect(await run()).toEqual([]);
      expect(calls).toHaveLength(0);
    }
  });
  it.each(["food_lead", "food_member", "edition_admin", "global_admin"])(
    "projects minimal roster and effective archived history for %s",
    async (role) => {
      access =
        role === "global_admin"
          ? { ...scoped("", "archived"), isGlobalAdmin: true, membership: null }
          : scoped(role);
      calls = [];
      results = [
        [
          {
            id: "guest",
            name: "Guest",
            humanId: "G1",
            kind: "guest",
            archivedAt: null,
            email: "private",
            phone: "private",
          },
          {
            id: "judge",
            name: "Judge",
            humanId: "J1",
            kind: "judge",
            archivedAt: new Date(),
          },
          {
            id: "removed",
            name: "Removed",
            humanId: "G2",
            kind: "guest",
            archivedAt: new Date(),
          },
        ],
        [
          {
            id: "check",
            attendeeId: "guest",
            type: "attendee_check_in",
            supersededByOperationId: null,
          },
          {
            id: "meal",
            attendeeId: "judge",
            type: "lunch",
            supersededByOperationId: null,
          },
          {
            id: "old",
            attendeeId: "removed",
            type: "breakfast",
            supersededByOperationId: "undo",
          },
        ],
      ];
      const rows = await run();
      expect(rows).toEqual([
        {
          id: "guest",
          name: "Guest",
          humanId: "G1",
          kind: "guest",
          state: "active",
          centers: [],
          operations: [
            {
              id: "check",
              type: "attendee_check_in",
              supersededByOperationId: null,
            },
          ],
        },
        {
          id: "judge",
          name: "Judge",
          humanId: "J1",
          kind: "judge",
          state: "archived",
          centers: [],
          operations: [
            { id: "meal", type: "lunch", supersededByOperationId: null },
          ],
        },
      ]);
      expect(Object.keys(calls[0]!.columns).sort()).toEqual([
        "archivedAt",
        "humanId",
        "id",
        "kind",
        "name",
      ]);
      expect(Object.keys(calls[1]!.columns).sort()).toEqual([
        "attendeeId",
        "id",
        "supersededByOperationId",
        "type",
      ]);
    }
  );
});
