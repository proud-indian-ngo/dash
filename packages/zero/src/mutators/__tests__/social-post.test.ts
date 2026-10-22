import { describe, expect, it } from "bun:test";

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
  mutator: { fn: (input: never) => Promise<unknown> },
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

  it.each(["approved", "failed"])("drops a %s post", async (status) => {
    const db = createDb({ socialPost: [post({ status })] });
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
    ).rejects.toThrow("Only queued, approved or failed posts can be dropped");
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

  it("lets finance.manage write only finance keys", () => {
    const ctx = { permissions: ["finance.manage"], userId: "u" };
    expect(() =>
      assertCanWriteAppConfig(ctx as never, "cash_voucher_limit_paise")
    ).not.toThrow();
    expect(() =>
      assertCanWriteAppConfig(ctx as never, "notifications_disabled")
    ).toThrow("Unauthorized");
  });

  it("lets finance.manage write a complete 80G registration only", async () => {
    const ctx = { permissions: ["finance.manage"], userId: "u" };
    const key = "donations_return_registration";
    expect(() => assertCanWriteAppConfig(ctx as never, key)).not.toThrow();
    expect(() =>
      assertCanWriteAppConfig(
        { permissions: ["finance.view"], userId: "u" } as never,
        key
      )
    ).toThrow("Unauthorized");
    const db = createDb();
    await run(appConfigMutators.upsert, db, ctx as never, {
      key,
      value: JSON.stringify({
        sectionCode: "Section 80G",
        urn: "AAATP1234AF20214",
        urnIssuedOn: "2021-05-28",
      }),
    });
    await expect(
      run(appConfigMutators.upsert, db, ctx as never, {
        key,
        value: JSON.stringify({ urn: "AAATP1234AF20214" }),
      })
    ).rejects.toThrow("80G registration");
    expect(db.writes).toHaveLength(1);
  });

  it("saves receipt details only through saveReceiptSettings", async () => {
    const ctx = { permissions: ["finance.manage"], userId: "u" };
    const key = "donation_receipt_settings";
    expect(() =>
      assertCanWriteAppConfig(
        { permissions: ["donors.manage"], userId: "u" } as never,
        key
      )
    ).toThrow("Unauthorized");
    const db = createDb();
    await expect(
      run(appConfigMutators.upsert, db, ctx as never, {
        key,
        value: JSON.stringify(receiptDetails),
      })
    ).rejects.toThrow("Save the receipt details from Settings");
    expect(db.writes).toEqual([]);
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

const receiptDetails = {
  orgAddress: "1 Test Road, Testville 560001",
  orgName: "Example Trust",
  orgPan: "aaate0000e",
  signatoryDesignation: "Treasurer",
  signatoryName: "Test Signatory",
};

function receiptCtx() {
  return {
    asyncTasks: [] as unknown[],
    beforeCommitTasks: [] as unknown[],
    copyR2Object: async () => undefined,
    enqueue: async () => null,
    lockR2Object: async () => undefined,
    lockR2ObjectForClaim: async () => undefined,
    permissions: ["finance.manage"],
    r2KeyPrefix: "app",
    rollbackTasks: [] as unknown[],
    userId: "u",
  };
}

function savedReceiptSettings(db: ReturnType<typeof createDb>): Row {
  const write = db.writes.at(-1);
  return JSON.parse(String(write?.row.value)) as Row;
}

describe("appConfig.saveReceiptSettings", () => {
  it("claims a new signature upload and stores its durable key", async () => {
    const db = createDb();
    const ctx = receiptCtx();
    await run(appConfigMutators.saveReceiptSettings, db, ctx, {
      ...receiptDetails,
      signatureUpload: "app/attachments/tmp/u/0199-signature.png",
    });
    expect(savedReceiptSettings(db)).toMatchObject({
      orgPan: "AAATE0000E",
      signatureKey: "app/attachments/receipt-signatures/0199-signature.png",
    });
    // The copy (with the PNG checks) runs before commit.
    expect(ctx.beforeCommitTasks.length).toBeGreaterThan(0);
  });

  it("keeps the stored signature when no new one is uploaded", async () => {
    const signatureKey = "app/attachments/receipt-signatures/old.png";
    const db = createDb({
      appConfig: [
        {
          key: "donation_receipt_settings",
          value: JSON.stringify({ ...receiptDetails, signatureKey }),
        },
      ],
    });
    await run(appConfigMutators.saveReceiptSettings, db, receiptCtx(), {
      ...receiptDetails,
      signatoryName: "New Signatory",
      signatureUpload: null,
    });
    expect(savedReceiptSettings(db)).toMatchObject({
      signatoryName: "New Signatory",
      signatureKey,
    });
  });

  it("refuses details without a signature, another user's upload, or a bad PAN", async () => {
    const db = createDb();
    await expect(
      run(appConfigMutators.saveReceiptSettings, db, receiptCtx(), {
        ...receiptDetails,
        signatureUpload: null,
      })
    ).rejects.toThrow("Upload the signatory's signature");
    await expect(
      run(appConfigMutators.saveReceiptSettings, db, receiptCtx(), {
        ...receiptDetails,
        signatureUpload: "app/attachments/tmp/someone-else/signature.png",
      })
    ).rejects.toThrow("Invalid attachment object key");
    await expect(
      run(appConfigMutators.saveReceiptSettings, db, receiptCtx(), {
        ...receiptDetails,
        orgPan: "not a pan",
        signatureUpload: "app/attachments/tmp/u/signature.png",
      })
    ).rejects.toThrow("receipt details");
    expect(db.writes).toEqual([]);
  });

  it("refuses someone without finance.manage", async () => {
    const db = createDb();
    await expect(
      run(appConfigMutators.saveReceiptSettings, db, volunteerCtx, {
        ...receiptDetails,
        signatureUpload: "app/attachments/tmp/vol-1/signature.png",
      })
    ).rejects.toThrow("Unauthorized");
  });
});
