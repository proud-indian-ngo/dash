import { beforeEach, describe, expect, it, mock } from "bun:test";

// Failure cases: a lead, claimant manager or edition manager leaks unrelated
// contacts; redaction removes candidates; users.view stops returning contacts;
// a caller without picker authority gains candidate discovery.
let permissions: string[] = [];
let isLead = false;
const candidate = {
  email: "unrelated@example.test",
  id: "unrelated-user",
  image: null,
  isActive: true,
  name: "Unrelated Candidate",
  role: "volunteer",
};

mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: async () => permissions,
}));
mock.module("@pi-dash/db", () => ({
  db: {
    select: (fields: Record<string, unknown>) => {
      const rows = "email" in fields ? [candidate] : [];
      const query = {
        from: () => query,
        innerJoin: () => query,
        leftJoin: () => query,
        limit: async () => (isLead ? [{ userId: "lead" }] : []),
        orderBy: async () => rows,
        then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
        where: () => query,
      };
      return query;
    },
  },
}));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      handler: (handler: unknown) => handler,
      middleware: () => builder,
      validator: () => builder,
    };
    return builder;
  },
}));
mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@/lib/api-auth", () => ({
  assertServerPermission: async () => {},
}));

const pickers = await import("./users-for-picker");
type Handler = (args: {
  context: { session: { user: { id: string; role: string } } | null };
  data: { editionId: string };
}) => Promise<(typeof candidate)[]>;
const args = {
  context: { session: { user: { id: "lead", role: "custom" } } },
  data: { editionId: "edition" },
};

beforeEach(() => {
  permissions = [];
  isLead = false;
});

describe("global picker contact visibility", () => {
  const cases = [
    ["team lead", pickers.getUsersForPicker, []],
    [
      "claimant manager",
      pickers.getClaimantsForPicker,
      ["requests.create_for_others"],
    ],
    [
      "edition manager",
      pickers.getKalakritiVolunteersForPicker,
      ["kalakriti.admin"],
    ],
    [
      "edition add manager",
      pickers.getKalakritiAddVolunteersForPicker,
      ["kalakriti.admin"],
    ],
  ] as const;

  for (const [name, picker, grants] of cases) {
    it(`${name} retains candidate names and IDs without disclosing email`, async () => {
      permissions = [...grants];
      isLead = true;
      expect(await (picker as unknown as Handler)(args)).toEqual([
        { ...candidate, email: "" },
      ]);
    });

    it(`${name} returns contacts with users.view`, async () => {
      permissions = [...grants, "users.view"];
      expect(await (picker as unknown as Handler)(args)).toEqual([candidate]);
    });

    it(`${name} still denies candidate discovery without authority`, async () => {
      expect(await (picker as unknown as Handler)(args)).toEqual([]);
    });
  }
});
