import { beforeEach, describe, expect, it, mock } from "bun:test";

const enqueue = mock();
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue }));

import type { Context } from "../../context";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { appConfigMutators, assertCanWriteAppConfig } from "../app-config";
import { createSchema, reimbursementMutators } from "../reimbursement";

type Row = Record<string, unknown>;

const KEY = "cash_voucher_limit_paise";

function createDb(
  location: "client" | "server",
  seed: Partial<Record<string, Row[]>> = {}
) {
  const tables: Record<string, Row[]> = {
    costCentre: [
      { active: true, code: "BLR", id: "cc-blr", name: "Bangalore" },
    ],
    appConfig: [],
    reimbursement: [],
    reimbursementAttachment: [],
    reimbursementHistory: [],
    reimbursementLineItem: [],
    ...seed,
  };
  const inserts: { row: Row; table: string }[] = [];
  const updates: { row: Row; table: string }[] = [];
  const deletes: { row: Row; table: string }[] = [];
  const tableApi = (table: string) => ({
    delete: async (row: Row) => {
      deletes.push({ row, table });
    },
    insert: async (row: Row) => {
      inserts.push({ row, table });
    },
    update: async (row: Row) => {
      updates.push({ row, table });
    },
    upsert: async (row: Row) => {
      inserts.push({ row, table });
    },
  });
  const tx = {
    // The row lock `update` takes on the server reads the seeded request.
    dbTransaction: {
      wrappedTransaction: {
        // The bank-match check takes the statement-line lock first.
        execute: async () => [],
        select: () => ({
          from: () => ({
            where: () => ({
              for: async () =>
                (tables.reimbursement ?? []).slice(0, 1).map((row) => ({
                  status: row.status,
                  voidedAt: null,
                })),
            }),
          }),
        }),
      },
    },
    location,
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
  return { deletes, inserts, tx, updates };
}

const limit = (paise: number) => ({
  appConfig: [{ key: KEY, value: String(paise) }],
});

const serverContext = (permissions: string[]): Context => ({
  asyncTasks: [],
  beforeCommitTasks: [],
  copyR2Object: mock(),
  enqueue: mock() as unknown as Context["enqueue"],
  lockR2Object: mock(),
  lockR2ObjectForClaim: mock(),
  permissions,
  r2KeyPrefix: "app",
  role: "admin",
  rollbackTasks: [],
  traceId: "trace-1",
  userId: "approver-1",
});

const approvedRequest = {
  id: "request-1",
  status: "approved",
  title: "Hall clean-up",
  userId: "owner-1",
};

beforeEach(() => {
  enqueue.mockReset();
});

describe("cash voucher limit setting", () => {
  const finance = { permissions: ["finance.manage"], userId: "u" };

  it("lets finance.manage set the limit", async () => {
    expect(() => assertCanWriteAppConfig(finance as never, KEY)).not.toThrow();
    const db = createDb("server");
    await appConfigMutators.upsert.fn({
      args: { key: KEY, value: "200000" },
      ctx: finance,
      tx: db.tx,
    } as never);
    expect(db.inserts.map((insert) => insert.row.value)).toEqual(["200000"]);
  });

  it("refuses finance.view", () => {
    expect(() =>
      assertCanWriteAppConfig(
        { permissions: ["finance.view"], userId: "u" } as never,
        KEY
      )
    ).toThrow("Unauthorized");
  });

  it.each(["1000100", "99", "0", "-100", "abc", "1e5"])(
    "refuses %s paise, outside ₹1 to ₹10,000",
    async (value) => {
      const db = createDb("server");
      await expect(
        appConfigMutators.upsert.fn({
          args: { key: KEY, value },
          ctx: finance,
          tx: db.tx,
        } as never)
      ).rejects.toThrow("The voucher limit must be between ₹1 and ₹10,000");
      expect(db.inserts).toEqual([]);
    }
  );

  it("accepts the ₹10,000 cap and ₹1", async () => {
    const db = createDb("server");
    for (const value of ["1000000", "100"]) {
      await appConfigMutators.upsert.fn({
        args: { key: KEY, value },
        ctx: finance,
        tx: db.tx,
      } as never);
    }
    expect(db.inserts).toHaveLength(2);
  });
});

describe("reimbursement.generateVoucher with the configured limit", () => {
  const item = (amountPaise: number) => ({
    amountPaise,
    id: "li-1",
    reimbursementId: "request-1",
  });

  it("refuses a ₹2,000 item under the ₹1,000 default", async () => {
    const db = createDb("server", {
      reimbursement: [approvedRequest],
      reimbursementLineItem: [item(200_000)],
    });
    await expect(
      reimbursementMutators.generateVoucher.fn({
        args: { lineItemId: "li-1", reimbursementId: "request-1" },
        ctx: serverContext(["requests.approve"]),
        tx: db.tx,
      } as never)
    ).rejects.toThrow("Vouchers can only be generated for items ≤ ₹1,000");
  });

  it("queues a ₹2,000 item once the limit is ₹2,000", async () => {
    const ctx = serverContext(["requests.approve"]);
    const db = createDb("server", {
      ...limit(200_000),
      reimbursement: [approvedRequest],
      reimbursementLineItem: [item(200_000)],
    });
    await reimbursementMutators.generateVoucher.fn({
      args: { lineItemId: "li-1", reimbursementId: "request-1" },
      ctx,
      tx: db.tx,
    } as never);
    await ctx.asyncTasks?.[0]?.fn();
    expect(enqueue).toHaveBeenCalledWith(
      "generate-cash-voucher",
      {
        approverUserId: "approver-1",
        lineItemId: "li-1",
        reimbursementId: "request-1",
      },
      { singletonKey: "voucher-li-1", traceId: "trace-1" }
    );
  });

  it("names the configured limit when refusing", async () => {
    const db = createDb("server", {
      ...limit(200_000),
      reimbursement: [approvedRequest],
      reimbursementLineItem: [item(200_001)],
    });
    await expect(
      reimbursementMutators.generateVoucher.fn({
        args: { lineItemId: "li-1", reimbursementId: "request-1" },
        ctx: serverContext(["requests.approve"]),
        tx: db.tx,
      } as never)
    ).rejects.toThrow("Vouchers can only be generated for items ≤ ₹2,000");
  });

  it("falls back to the default when the stored value is past the cap", async () => {
    const db = createDb("server", {
      appConfig: [{ key: KEY, value: "5000000" }],
      reimbursement: [approvedRequest],
      reimbursementLineItem: [item(200_000)],
    });
    await expect(
      reimbursementMutators.generateVoucher.fn({
        args: { lineItemId: "li-1", reimbursementId: "request-1" },
        ctx: serverContext(["requests.approve"]),
        tx: db.tx,
      } as never)
    ).rejects.toThrow("≤ ₹1,000");
  });
});

describe("reimbursement.approve with the configured limit", () => {
  it("queues vouchers for opted-in items up to the configured limit", async () => {
    const ctx = serverContext(["requests.approve"]);
    const db = createDb("server", {
      ...limit(200_000),
      reimbursement: [
        {
          approvalScreenshotKey:
            "app/approval-screenshots/tmp/approver-1/proof.png",
          id: "request-1",
          status: "pending",
          title: "Hall clean-up",
          userId: "owner-1",
        },
      ],
      reimbursementLineItem: [
        {
          amountPaise: 200_000,
          generateVoucher: true,
          id: "li-in",
          reimbursementId: "request-1",
        },
        {
          amountPaise: 200_001,
          generateVoucher: true,
          id: "li-over",
          reimbursementId: "request-1",
        },
      ],
    });
    await reimbursementMutators.approve.fn({
      args: { id: "request-1" },
      ctx,
      tx: db.tx,
    } as never);
    const task = ctx.asyncTasks?.find(
      (t) => t.meta.mutator === "approveReimbursement"
    );
    await task?.fn();
    const voucherItems = enqueue.mock.calls
      .filter(([name]) => name === "generate-cash-voucher")
      .map(([, payload]) => (payload as { lineItemId: string }).lineItemId);
    expect(voucherItems).toEqual(["li-in"]);
  });
});

describe("reimbursement.create voucher fields", () => {
  const args = (lineItems: Row[]) => ({
    attachments: [],
    chargedTo: "organisation",
    costCentreId: "cc-blr",
    expenseDate: new Date("2026-10-01").getTime(),
    id: "request-2",
    lineItems,
    title: "Hall clean-up",
  });
  const lineItem = (id: string, amountPaise: number, extra: Row = {}) => ({
    amountPaise,
    categoryId: "cat-1",
    description: "Cleaning",
    generateVoucher: true,
    id,
    payeeName: "Test Payee",
    payeePhone: "+919876543210",
    sortOrder: 0,
    ...extra,
  });

  it("keeps the opt-in and phone within the limit and drops them above it", async () => {
    const db = createDb("client", limit(200_000));
    await reimbursementMutators.create.fn({
      args: createSchema.parse(
        args([
          lineItem("li-in", 200_000),
          lineItem("li-over", 200_001),
          lineItem("li-no-voucher", 50_000, { generateVoucher: false }),
        ])
      ),
      ctx: {
        permissions: ["requests.create"],
        role: "volunteer",
        userId: "owner-1",
      },
      tx: db.tx,
    } as never);
    const items = db.inserts
      .filter((insert) => insert.table === "reimbursementLineItem")
      .map(({ row }) => [
        row.id,
        row.generateVoucher,
        row.payeeName,
        row.payeePhone,
      ]);
    expect(items).toEqual([
      ["li-in", true, "Test Payee", "+919876543210"],
      ["li-over", false, null, null],
      ["li-no-voucher", false, null, null],
    ]);
  });

  it("refuses a payee phone that isn't an Indian mobile", () => {
    const result = createSchema.safeParse(
      args([lineItem("li-1", 50_000, { payeePhone: "+14155550123" })])
    );
    expect(result.success).toBe(false);
  });

  it("wants the payee's name in English letters", () => {
    const result = createSchema.safeParse(
      args([lineItem("li-1", 50_000, { payeeName: "रमेश" })])
    );
    expect(result.error?.issues[0]?.message).toBe(
      "Write the name in English letters"
    );
    expect(
      createSchema.safeParse(
        args([lineItem("li-1", 50_000, { payeeName: "Kṛṣṇa D'Souza" })])
      ).success
    ).toBe(true);
  });

  it("accepts a missing payee phone", () => {
    const result = createSchema.safeParse(
      args([lineItem("li-1", 50_000, { payeePhone: null })])
    );
    expect(result.success).toBe(true);
  });
});

describe("reimbursement voucher payee", () => {
  it("requires a payee name on a voucher item", async () => {
    const db = createDb("client");
    await expect(
      reimbursementMutators.create.fn({
        args: createSchema.parse({
          attachments: [],
          chargedTo: "organisation",
          costCentreId: "cc-blr",
          expenseDate: new Date("2026-10-01").getTime(),
          id: "request-3",
          lineItems: [
            {
              amountPaise: 50_000,
              categoryId: "cat-1",
              description: "Cleaning",
              generateVoucher: true,
              id: "li-1",
              payeeName: "  ",
              sortOrder: 0,
            },
          ],
          title: "Hall clean-up",
        }),
        ctx: {
          permissions: ["requests.create"],
          role: "volunteer",
          userId: "owner-1",
        },
        tx: db.tx,
      } as never)
    ).rejects.toThrow("Name who was paid on each cash voucher");
  });

  const createWith = async (lineItem: Row) => {
    const db = createDb("client");
    await reimbursementMutators.create.fn({
      args: createSchema.parse({
        attachments: [],
        chargedTo: "organisation",
        costCentreId: "cc-blr",
        expenseDate: new Date("2026-10-01").getTime(),
        id: "request-3",
        lineItems: [
          {
            amountPaise: 50_000,
            categoryId: "cat-1",
            description: "Cleaning",
            generateVoucher: true,
            id: "li-1",
            sortOrder: 0,
            ...lineItem,
          },
        ],
        title: "Hall clean-up",
      }),
      ctx: {
        permissions: ["requests.create"],
        role: "volunteer",
        userId: "owner-1",
      },
      tx: db.tx,
    } as never);
    return db.inserts.find((i) => i.table === "reimbursementLineItem")?.row;
  };

  it("stores no payee on an item paid to the claimant", async () => {
    expect(
      await createWith({
        payeeIsClaimant: true,
        payeeName: "Leftover Name",
        payeePhone: "+919876543210",
      })
    ).toMatchObject({
      generateVoucher: true,
      payeeName: null,
      payeePhone: null,
    });
  });

  it("still requires the name when the item isn't paid to the claimant", async () => {
    await expect(
      createWith({ payeeIsClaimant: false, payeeName: null })
    ).rejects.toThrow("Name who was paid on each cash voucher");
  });
});

describe("reimbursement.update and existing vouchers", () => {
  const VOUCHER_KEY = "app/vouchers/request-1/att-voucher.pdf";
  const SIGNED_KEY = "app/attachments/reimbursements/request-1/att-signed.pdf";
  const stored = (overrides: Row = {}) => ({
    amountPaise: 50_000,
    categoryId: "cat-1",
    description: "Cleaning",
    generateVoucher: true,
    id: "li-1",
    payeeName: "Test Payee",
    payeePhone: "+919876543210",
    reimbursementId: "request-1",
    signedVoucherAttachmentId: "att-signed",
    sortOrder: 0,
    voucherAttachmentId: "att-voucher",
    ...overrides,
  });
  const file = (id: string, objectKey: string) => ({
    filename: `${id}.pdf`,
    id,
    objectKey,
    reimbursementId: "request-1",
    type: "file" as const,
  });
  const EXPENSE_DATE = new Date("2026-10-01").getTime();
  const args = (lineItem: Row = {}, overrides: Row = {}) => ({
    attachments: [
      file("att-voucher", VOUCHER_KEY),
      file("att-signed", SIGNED_KEY),
    ],
    chargedTo: "organisation",
    costCentreId: "cc-blr",
    expenseDate: EXPENSE_DATE,
    id: "request-1",
    lineItems: [
      {
        amountPaise: 50_000,
        categoryId: "cat-1",
        description: "Cleaning",
        generateVoucher: true,
        id: "li-1",
        payeeName: "Test Payee",
        payeePhone: "+919876543210",
        sortOrder: 0,
        ...lineItem,
      },
    ],
    title: "Hall clean-up",
    ...overrides,
  });
  const seed = (extra: Partial<Record<string, Row[]>> = {}) => ({
    reimbursement: [
      {
        ...approvedRequest,
        chargedTo: "organisation",
        expenseDate: EXPENSE_DATE,
      },
    ],
    reimbursementAttachment: [
      file("att-voucher", VOUCHER_KEY),
      file("att-signed", SIGNED_KEY),
    ],
    reimbursementLineItem: [stored()],
    ...extra,
  });
  const edit = async (
    db: ReturnType<typeof createDb>,
    editArgs: Row,
    ctx: Row = {
      permissions: ["requests.edit_all_statuses"],
      role: "admin",
      userId: "admin-1",
    }
  ) => {
    await reimbursementMutators.update.fn({
      args: createSchema.parse(editArgs),
      ctx,
      tx: db.tx,
    } as never);
    return {
      inserted: db.inserts.find((i) => i.table === "reimbursementLineItem")
        ?.row,
      links: db.updates
        .filter((u) => u.table === "reimbursementLineItem")
        .map((u) => u.row),
    };
  };
  const relinked = [
    {
      id: "li-1",
      signedVoucherAttachmentId: "att-signed",
      voucherAttachmentId: "att-voucher",
    },
  ];

  it("restores the voucher and signed copy of an unchanged item", async () => {
    const { links } = await edit(createDb("client", seed()), args());
    expect(links).toEqual(relinked);
  });

  it.each([
    ["amount", { amountPaise: 60_000 }, {}],
    ["description", { description: "Cleaning and painting" }, {}],
    ["category", { categoryId: "cat-2" }, {}],
    ["payee name", { payeeName: "Other Payee" }, {}],
    ["payee mobile", { payeePhone: "+919000000002" }, {}],
    ["expense date", {}, { expenseDate: new Date("2026-09-30").getTime() }],
  ])("treats a changed %s as a stale voucher", async (_, item, request) => {
    const { links } = await edit(
      createDb("client", seed()),
      args(item, request)
    );
    expect(links).toEqual([]);
  });

  it("keeps the voucher when the same day is picked again", async () => {
    // The form sends local midnight in India; the stored date reads back
    // as midnight UTC. Same calendar day, so the voucher stands.
    const { links } = await edit(
      createDb("client", seed()),
      args({}, { expenseDate: EXPENSE_DATE - 5.5 * 60 * 60 * 1000 })
    );
    expect(links).toEqual(relinked);
  });

  it("treats ticking paid to the claimant as a stale voucher", async () => {
    const { inserted, links } = await edit(
      createDb("client", seed()),
      args({ payeeIsClaimant: true })
    );
    expect(inserted).toMatchObject({ payeeName: null, payeePhone: null });
    expect(links).toEqual([]);
  });

  it("treats unticking paid to the claimant as a stale voucher", async () => {
    const { inserted, links } = await edit(
      createDb(
        "client",
        seed({
          reimbursementLineItem: [
            stored({ payeeName: null, payeePhone: null }),
          ],
        })
      ),
      args({ payeeIsClaimant: false, payeeName: "Ravi", payeePhone: null })
    );
    expect(inserted).toMatchObject({ payeeName: "Ravi" });
    expect(links).toEqual([]);
  });

  it("keeps the voucher of an item still paid to the claimant", async () => {
    const { links } = await edit(
      createDb(
        "client",
        seed({
          reimbursementLineItem: [
            stored({ payeeName: null, payeePhone: null }),
          ],
        })
      ),
      args({ payeeIsClaimant: true, payeeName: null, payeePhone: null })
    );
    expect(links).toEqual(relinked);
  });

  it("stores an explicit untick and keeps the voucher", async () => {
    const { inserted, links } = await edit(
      createDb("client", seed()),
      args({ generateVoucher: false, payeeName: null, payeePhone: null })
    );
    expect(inserted).toMatchObject({
      generateVoucher: false,
      payeeName: "Test Payee",
      payeePhone: "+919876543210",
    });
    expect(links).toEqual(relinked);
  });

  it("drops the link when the voucher file was removed", async () => {
    const { links } = await edit(
      createDb("client", seed()),
      args({}, { attachments: [file("att-signed", SIGNED_KEY)] })
    );
    expect(links).toEqual([]);
  });

  it("drops the link when another file took the voucher's id", async () => {
    const { links } = await edit(
      createDb("client", seed()),
      args(
        {},
        {
          attachments: [
            file("att-voucher", "app/attachments/tmp/admin-1/other.pdf"),
            file("att-signed", SIGNED_KEY),
          ],
        }
      )
    );
    expect(links).toEqual([]);
  });

  it("keeps the voucher but not a signed copy whose key changed", async () => {
    const { links } = await edit(
      createDb("client", seed()),
      args(
        {},
        {
          attachments: [
            file("att-voucher", VOUCHER_KEY),
            file("att-signed", "app/attachments/tmp/admin-1/other.pdf"),
          ],
        }
      )
    );
    expect(links).toEqual([
      {
        id: "li-1",
        signedVoucherAttachmentId: null,
        voucherAttachmentId: "att-voucher",
      },
    ]);
  });

  it("keeps the stored opt-in and payee after the limit was lowered", async () => {
    // ₹500 item with a voucher; the limit is now ₹200, so the form hid and
    // cleared the voucher fields of this untouched item.
    const { inserted, links } = await edit(
      createDb("client", seed(limit(20_000))),
      args({ generateVoucher: false, payeeName: null, payeePhone: null })
    );
    expect(inserted).toMatchObject({
      generateVoucher: true,
      payeeName: "Test Payee",
      payeePhone: "+919876543210",
    });
    expect(links).toEqual(relinked);
  });

  describe("on the server", () => {
    const serverEdit = async (lineItem: Row, extra = {}) => {
      const ctx = serverContext(["requests.edit_all_statuses"]);
      const db = createDb("server", seed(extra));
      await reimbursementMutators.update.fn({
        args: createSchema.parse(args(lineItem)),
        ctx,
        tx: db.tx,
      } as never);
      for (const task of ctx.asyncTasks ?? []) {
        if (task.meta.mutator === "reimbursement.update:queueVouchers") {
          await task.fn();
        }
      }
      return enqueue.mock.calls
        .filter(([name]) => name === "generate-cash-voucher")
        .map(([, payload]) => (payload as { lineItemId: string }).lineItemId);
    };

    it("queues a fresh voucher for a changed item of an approved request", async () => {
      expect(await serverEdit({ description: "Cleaning twice" })).toEqual([
        "li-1",
      ]);
    });

    it("queues a fresh voucher when the item becomes paid to the claimant", async () => {
      expect(await serverEdit({ payeeIsClaimant: true })).toEqual(["li-1"]);
    });

    it("queues nothing for an unchanged item", async () => {
      expect(await serverEdit({})).toEqual([]);
    });

    it("queues an opted-in item that has no voucher yet", async () => {
      expect(
        await serverEdit(
          {},
          {
            reimbursementLineItem: [
              stored({
                signedVoucherAttachmentId: null,
                voucherAttachmentId: null,
              }),
            ],
          }
        )
      ).toEqual(["li-1"]);
    });
  });
});

describe("reimbursement.attachSignedVoucher", () => {
  const owner = { permissions: [], role: "volunteer", userId: "owner-1" };
  const signedCopy = (userId: string, id = "att-new") => ({
    filename: "signed.jpg",
    id,
    mimeType: "image/jpeg",
    objectKey: `pi-dash/attachments/tmp/${userId}/signed.jpg`,
  });
  const lineItem = (overrides: Row = {}) => ({
    amountPaise: 50_000,
    id: "li-1",
    reimbursementId: "request-1",
    signedVoucherAttachmentId: null,
    voucherAttachmentId: "att-voucher",
    ...overrides,
  });
  const seed = (overrides: Partial<Record<string, Row[]>> = {}) => ({
    reimbursement: [approvedRequest],
    reimbursementLineItem: [lineItem()],
    ...overrides,
  });
  const attach = (
    db: ReturnType<typeof createDb>,
    ctx: Row,
    overrides: Row = {}
  ) =>
    reimbursementMutators.attachSignedVoucher.fn({
      args: {
        lineItemId: "li-1",
        reimbursementId: "request-1",
        replacesAttachmentId: null,
        signedCopy: signedCopy(String(ctx.userId)),
        ...overrides,
      },
      ctx,
      tx: db.tx,
    } as never);

  it("lets the claimant attach the signed copy", async () => {
    const db = createDb("client", seed());
    await attach(db, owner);
    expect(
      db.inserts.find((i) => i.table === "reimbursementAttachment")?.row.id
    ).toBe("att-new");
    expect(
      db.updates.find((u) => u.table === "reimbursementLineItem")?.row
        .signedVoucherAttachmentId
    ).toBe("att-new");
  });

  it("lets finance attach it", async () => {
    const finance = {
      permissions: ["finance.manage"],
      role: "admin",
      userId: "fin-1",
    };
    await expect(
      attach(createDb("client", seed()), finance)
    ).resolves.toBeUndefined();
  });

  it("refuses someone else's volunteer", async () => {
    await expect(
      attach(createDb("client", seed()), {
        permissions: ["requests.edit_own"],
        role: "volunteer",
        userId: "vol-2",
      })
    ).rejects.toThrow("Unauthorized");
  });

  it("needs a generated voucher and an approved request", async () => {
    await expect(
      attach(
        createDb(
          "client",
          seed({
            reimbursementLineItem: [lineItem({ voucherAttachmentId: null })],
          })
        ),
        owner
      )
    ).rejects.toThrow("Generate the voucher before uploading a signed copy");
    await expect(
      attach(
        createDb(
          "client",
          seed({ reimbursement: [{ ...approvedRequest, status: "pending" }] })
        ),
        owner
      )
    ).rejects.toThrow("Only approved reimbursements take a signed voucher");
  });

  it("refuses a line item of another request", async () => {
    await expect(
      attach(
        createDb(
          "client",
          seed({
            reimbursementLineItem: [lineItem({ reimbursementId: "request-2" })],
          })
        ),
        owner
      )
    ).rejects.toThrow("Line item");
  });

  it("replaces a signed copy and keeps the old file attached", async () => {
    const db = createDb(
      "client",
      seed({
        reimbursementAttachment: [{ id: "att-old", objectKey: "old" }],
        reimbursementLineItem: [
          lineItem({ signedVoucherAttachmentId: "att-old" }),
        ],
      })
    );
    await attach(db, owner, { replacesAttachmentId: "att-old" });
    expect(
      db.updates.find((u) => u.table === "reimbursementLineItem")?.row
        .signedVoucherAttachmentId
    ).toBe("att-new");
    expect(db.deletes).toEqual([]);
    expect(
      db.inserts.find((i) => i.table === "reimbursementHistory")?.row.note
    ).toBe("Signed voucher replaced");
  });

  it("refuses a replace racing another upload", async () => {
    const db = createDb(
      "client",
      seed({
        reimbursementLineItem: [
          lineItem({ signedVoucherAttachmentId: "att-other" }),
        ],
      })
    );
    await expect(
      attach(db, owner, { replacesAttachmentId: "att-old" })
    ).rejects.toThrow("The signed copy changed meanwhile");
  });

  it.each([
    ["another user's upload", "app/attachments/tmp/someone-else/signed.jpg"],
    ["a durable key", "app/attachments/reimbursements/request-2/signed.jpg"],
  ])("refuses %s on the server", async (_, objectKey) => {
    const ctx = {
      ...serverContext([]),
      role: "volunteer",
      userId: "owner-1",
    };
    await expect(
      attach(createDb("server", seed()), ctx, {
        signedCopy: { ...signedCopy("owner-1"), objectKey },
      })
    ).rejects.toThrow("Invalid attachment object key");
  });
});
