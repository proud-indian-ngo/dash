import { describe, expect, it } from "bun:test";

import { SOCIAL_MANAGE_CONFIG_KEYS } from "@pi-dash/shared/social-api";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { appConfigMutators, assertCanWriteAppConfig } from "../app-config";
import { socialPostMutators } from "../social-post";

const NOW = 1_800_000_000_000;

type Row = Record<string, unknown>;

function createDb(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    appConfig: [],
    socialPost: [],
    ...seed,
  };
  const writes: { action: string; row: Row; table: string }[] = [];
  const tableApi = (table: string) => ({
    delete: async (row: Row) => {
      writes.push({ action: "delete", row, table });
    },
    update: async (row: Row) => {
      writes.push({ action: "update", row, table });
      const current = tables[table]?.find((item) => item.id === row.id);
      if (!current) {
        throw new Error(`Missing ${table} ${String(row.id)}`);
      }
      Object.assign(current, row);
    },
    upsert: async (row: Row) => {
      writes.push({ action: "upsert", row, table });
    },
  });
  const tx = {
    location: "server",
    mutate: Object.fromEntries(
      Object.keys(tables).map((table) => [table, tableApi(table)])
    ),
    run: async (query: { ast: ScopeAst; format: { singular: boolean } }) => {
      const result = (tables[query.ast.table] ?? []).filter((row) =>
        matchesScope(
          row as ScopeRow,
          query.ast.where,
          tables as unknown as ScopeTables
        )
      );
      return query.format.singular ? result[0] : result;
    },
  };
  return { tables, tx, writes };
}

function run(
  mutator: { fn: (input: never) => Promise<void> },
  db: ReturnType<typeof createDb>,
  ctx: Row | undefined,
  args: Row
) {
  return mutator.fn({ args, ctx, tx: db.tx } as never);
}

function post(overrides: Row = {}): Row {
  return {
    bufferPostId: "buffer-1",
    channel: "instagram",
    droppedAt: null,
    droppedBy: null,
    eventId: "event-1",
    id: "post-1",
    kind: "recap",
    status: "queued",
    ...overrides,
  };
}

const volunteerCtx = {
  permissions: ["events.view_own"],
  role: "volunteer",
  userId: "vol-1",
};
const socialManagerCtx = {
  permissions: ["social.manage"],
  role: "admin",
  userId: "admin-1",
};
const superAdminCtx = {
  permissions: ["settings.app_config", "social.manage"],
  role: "super_admin",
  userId: "super-1",
};

describe("socialPost.drop", () => {
  it("denies a volunteer", async () => {
    const db = createDb({ socialPost: [post()] });
    await expect(
      run(socialPostMutators.drop, db, volunteerCtx, { id: "post-1", now: NOW })
    ).rejects.toThrow("Unauthorized");
    expect(db.writes).toEqual([]);
  });

  it("denies a missing session", async () => {
    const db = createDb({ socialPost: [post()] });
    await expect(
      run(socialPostMutators.drop, db, undefined, { id: "post-1", now: NOW })
    ).rejects.toThrow("Unauthorized");
  });

  it.each([
    ["social.manage", socialManagerCtx],
    ["super_admin", superAdminCtx],
  ])("lets %s drop a queued post and records who and when", async (_, ctx) => {
    const db = createDb({ socialPost: [post()] });
    await run(socialPostMutators.drop, db, ctx, { id: "post-1", now: NOW });
    expect(db.tables.socialPost?.[0]).toMatchObject({
      droppedAt: NOW,
      droppedBy: ctx.userId,
      status: "dropped",
      updatedAt: NOW,
    });
  });

  it("drops an approved post", async () => {
    const db = createDb({ socialPost: [post({ status: "approved" })] });
    await run(socialPostMutators.drop, db, socialManagerCtx, {
      id: "post-1",
      now: NOW,
    });
    expect(db.tables.socialPost?.[0]?.status).toBe("dropped");
  });

  it.each(["published", "dropped"])("refuses a %s post", async (status) => {
    const db = createDb({ socialPost: [post({ status })] });
    await expect(
      run(socialPostMutators.drop, db, socialManagerCtx, {
        id: "post-1",
        now: NOW,
      })
    ).rejects.toThrow("Only queued or approved posts can be dropped");
    expect(db.writes).toEqual([]);
  });

  it("refuses an unknown post", async () => {
    const db = createDb();
    await expect(
      run(socialPostMutators.drop, db, socialManagerCtx, {
        id: "missing",
        now: NOW,
      })
    ).rejects.toThrow("Social post not found");
  });
});

describe("appConfig key gating", () => {
  const socialKeys = [
    "social_paused",
    "social_paused_kinds",
    "social_approver_user_id",
    "social_all_time_hours",
    "social_all_time_optimists",
    "social_all_time_reached",
    "social_rules",
  ];

  it("gates exactly the social keys", () => {
    expect([...SOCIAL_MANAGE_CONFIG_KEYS].sort()).toEqual(
      [...socialKeys].sort()
    );
  });

  it.each(socialKeys)("lets social.manage write %s", async (key) => {
    const db = createDb();
    await run(appConfigMutators.upsert, db, socialManagerCtx, {
      key,
      value: "true",
    });
    await run(appConfigMutators.remove, db, socialManagerCtx, { key });
    expect(db.writes.map((write) => write.action)).toEqual([
      "upsert",
      "delete",
    ]);
  });

  it.each(["notifications_disabled", "social_something_else", "org_name"])(
    "refuses social.manage on %s",
    async (key) => {
      const db = createDb();
      await expect(
        run(appConfigMutators.upsert, db, socialManagerCtx, { key, value: "x" })
      ).rejects.toThrow("Unauthorized");
      await expect(
        run(appConfigMutators.remove, db, socialManagerCtx, { key })
      ).rejects.toThrow("Unauthorized");
      expect(db.writes).toEqual([]);
    }
  );

  it("refuses a volunteer on social keys", async () => {
    const db = createDb();
    await expect(
      run(appConfigMutators.upsert, db, volunteerCtx, {
        key: "social_paused",
        value: "true",
      })
    ).rejects.toThrow("Unauthorized");
  });

  it("lets settings.app_config write any key", () => {
    const ctx = { permissions: ["settings.app_config"], userId: "u" };
    for (const key of ["notifications_disabled", "social_paused"]) {
      expect(() => assertCanWriteAppConfig(ctx as never, key)).not.toThrow();
    }
  });

  it("lets super_admin write any key", async () => {
    const db = createDb();
    await run(appConfigMutators.upsert, db, superAdminCtx, {
      key: "notifications_disabled",
      value: "true",
    });
    expect(db.writes).toHaveLength(1);
  });
});
