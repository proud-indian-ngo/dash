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
let permissions = ["kalakriti.view"];
let ran: unknown[] = [];
let memberships: unknown[] = [];
mock.module("@/lib/api-auth", () => ({
  buildSessionContext: (session: { user: { id: string; role: string } }) =>
    Promise.resolve({
      permissions,
      role: session.user.role,
      userId: session.user.id,
    }),
}));
mock.module("@/lib/server/zero-db", () => ({
  zeroDb: {
    run: (query: unknown) => {
      ran.push(query);
      return Promise.resolve(memberships);
    },
  },
}));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: () => ({ handler: (handler: unknown) => handler }),
    }),
  }),
}));
const { getKalakritiFoodAttendees, getKalakritiFoodMemberships } =
  await import("./kalakriti-food");
const { kalakritiFoodServerQueries } = await import("@pi-dash/zero/queries");
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

const runMemberships = (
  session: unknown = { user: { id: "actor", role: "volunteer" } }
) =>
  (
    getKalakritiFoodMemberships as unknown as (
      input: unknown
    ) => Promise<unknown[]>
  )({ context: { session }, data: { editionId: "edition" } });
const scopedAst = (ctx: { permissions: string[]; userId: string }) =>
  (
    kalakritiFoodServerQueries.memberships({
      args: { editionId: "edition" },
      ctx: { ...ctx, role: "volunteer" },
    }) as unknown as { ast: unknown }
  ).ast;

describe("Food membership server projection", () => {
  it("denies anonymous readers before querying", async () => {
    ran = [];
    await expect(runMemberships(null)).rejects.toThrow("Unauthorized");
    expect(ran).toHaveLength(0);
  });
  it.each([["kalakriti.view"], ["kalakriti.admin"], []] as string[][])(
    "runs the scoped Food membership query with the session's %p permissions",
    async (...granted: string[]) => {
      permissions = granted;
      ran = [];
      memberships = [];
      expect(await runMemberships()).toEqual([]);
      expect(ran).toHaveLength(1);
      expect((ran[0] as { ast: unknown }).ast).toEqual(
        scopedAst({ permissions, userId: "actor" })
      );
    }
  );
  it("projects roster fields and never serializes contact snapshots", async () => {
    permissions = ["kalakriti.view"];
    const center = (id: string) => ({
      id,
      name: `Center ${id}`,
      editionId: "edition",
      createdBy: "private-creator",
    });
    memberships = [
      {
        id: "guardian",
        editionId: "edition",
        userId: "guardian-user",
        kind: "guardian",
        state: "active",
        humanId: "KALG-1",
        snapshotName: "Guardian",
        snapshotEmail: "guardian@private.test",
        snapshotPhone: "+910000000001",
        createdBy: "private-creator",
        assignments: [],
        guardianCenters: [
          { id: "link-a", membershipId: "guardian", center: center("a") },
          { id: "link-missing", membershipId: "guardian" },
        ],
        operations: [
          {
            id: "meal",
            type: "breakfast",
            supersededByOperationId: null,
            recordedBy: "private-recorder",
          },
        ],
      },
      {
        id: "volunteer",
        editionId: "edition",
        userId: null,
        kind: "volunteer",
        state: null,
        humanId: null,
        snapshotName: "Volunteer",
        snapshotEmail: "volunteer@private.test",
        snapshotPhone: "+910000000002",
        assignments: [
          {
            id: "assignment-b",
            membershipId: "volunteer",
            responsibility: "liaison",
            center: center("b"),
          },
        ],
        guardianCenters: [],
        operations: [],
      },
    ];
    const rows = await runMemberships();
    expect(rows).toEqual([
      {
        id: "guardian",
        name: "Guardian",
        humanId: "KALG-1",
        kind: "guardian",
        state: "active",
        centers: [{ id: "a", name: "Center a" }],
        operations: [
          { id: "meal", type: "breakfast", supersededByOperationId: null },
        ],
      },
      {
        id: "volunteer",
        name: "Volunteer",
        humanId: null,
        kind: "volunteer",
        state: undefined,
        centers: [{ id: "b", name: "Center b" }],
        operations: [],
      },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/private|@|\+91/);
  });
});
