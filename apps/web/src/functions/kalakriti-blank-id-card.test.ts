import { beforeEach, describe, expect, it, mock } from "bun:test";

let access: unknown;
let results: unknown[][];
let reads = 0;
mock.module("@pi-dash/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            reads++;
            return results.shift() ?? [];
          },
        }),
      }),
    }),
  },
}));
mock.module("@/lib/server/kalakriti-edition-access", () => ({
  resolveKalakritiEditionAccess: async () => access,
}));
mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: () => ({ handler: (handler: unknown) => handler }),
    }),
  }),
}));
const { validateBlankIdCard } = await import("./kalakriti-blank-id-card");
const card = { id: "01900000-0000-7000-8000-000000000005", type: "guest" };
const run = (
  person = card,
  session: unknown = { user: { id: "admin", role: "admin" } }
) =>
  (validateBlankIdCard as unknown as (input: unknown) => Promise<unknown>)({
    context: { session },
    data: { editionId: "edition-1", personQr: JSON.stringify(person) },
  });

describe("blank ID registration preflight", () => {
  beforeEach(() => {
    access = { isGlobalAdmin: true, edition: { lifecycle: "live" } };
    reads = 0;
    results = [[{ year: 2027 }], [], [], []];
  });
  it("allows an unused QR without creating a person", async () => {
    expect(await run()).toEqual(card);
    expect(reads).toBe(4);
  });
  it("rejects signed-out and unauthorized callers", async () => {
    await expect(run(card, null)).rejects.toThrow("Unauthorized");
    expect(reads).toBe(0);
    access = {
      isGlobalAdmin: false,
      membership: { responsibilities: ["food_lead"] },
    };
    await expect(run()).rejects.toThrow("Unauthorized");
    expect(reads).toBe(1);
  });
  it("rejects archived editions and unsupported card types", async () => {
    access = { isGlobalAdmin: true, edition: { lifecycle: "archived" } };
    await expect(run()).rejects.toThrow("archived");
    access = { isGlobalAdmin: true, edition: { lifecycle: "live" } };
    results = [[{ year: 2027 }]];
    await expect(run({ ...card, type: "student" })).rejects.toThrow(
      "Scan a blank"
    );
  });
  it("rejects an ID already used by any person type, including inactive records", async () => {
    for (let index = 0; index < 3; index++) {
      results = [
        [{ year: 2027 }],
        ...Array.from({ length: 3 }, (_, slot) =>
          slot === index ? [{ id: card.id }] : []
        ),
      ];
      await expect(run()).rejects.toThrow("already registered");
    }
  });
});
