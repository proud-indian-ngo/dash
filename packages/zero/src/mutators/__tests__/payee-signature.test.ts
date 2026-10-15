import { describe, expect, it, mock } from "bun:test";

import { payeeSignatureStatement } from "@pi-dash/shared/payee-signature";

mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue: mock() }));

import type { Context } from "../../context";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { createSchema, reimbursementMutators } from "../reimbursement";

type Row = Record<string, unknown>;

function createDb(
  location: "client" | "server",
  seed: Partial<Record<string, Row[]>> = {},
  /** What the row lock reads on the server, when it differs from the seed. */
  locked?: Row
) {
  const tables: Record<string, Row[]> = {
    appConfig: [],
    expenseCategory: [{ id: "cat-1", name: "Labour" }],
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
  });
  const lockReads: Row[] = [];
  const lockedRow = () => {
    const row = locked ?? tables.reimbursement?.[0] ?? {};
    lockReads.push(row);
    return [{ status: row.status, voidedAt: null }];
  };
  const tx = {
    dbTransaction: {
      wrappedTransaction: {
        select: () => ({
          from: () => ({ where: () => ({ for: async () => lockedRow() }) }),
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
  return { deletes, inserts, lockReads, tx, updates };
}

const serverContext = (
  userId: string,
  permissions: string[] = []
): Context => ({
  asyncTasks: [],
  beforeCommitTasks: [],
  copyR2Object: mock(),
  enqueue: mock() as unknown as Context["enqueue"],
  lockR2Object: mock(),
  lockR2ObjectForClaim: mock(),
  permissions,
  r2KeyPrefix: "app",
  role: "volunteer",
  rollbackTasks: [],
  traceId: "trace-1",
  userId,
});

// Synthetic details only. 1 Oct 2026, 10:00 in India.
const EXPENSE_DATE = Date.UTC(2026, 9, 1, 4, 30);
const pendingRequest = {
  chargedTo: "organisation",
  expenseDate: EXPENSE_DATE,
  id: "request-1",
  status: "pending",
  title: "Hall clean-up",
  userId: "owner-1",
};
const STATEMENT = payeeSignatureStatement({
  amountPaise: 50_000,
  categoryName: "Labour",
  description: "Cleaning",
  expenseDate: EXPENSE_DATE,
  payeeName: "Test Payee",
});
const SIGNATURE_KEY = "app/attachments/reimbursements/request-1/att-sig.png";

const owner = { permissions: [], role: "volunteer", userId: "owner-1" };

const lineItem = (overrides: Row = {}) => ({
  amountPaise: 50_000,
  categoryId: "cat-1",
  description: "Cleaning",
  generateVoucher: true,
  id: "li-1",
  payeeName: "Test Payee",
  payeePhone: "+919876543210",
  payeeSignatureAttachmentId: null,
  reimbursementId: "request-1",
  signedVoucherAttachmentId: null,
  sortOrder: 0,
  voucherAttachmentId: null,
  ...overrides,
});

describe("reimbursement.collectPayeeSignature", () => {
  const seed = (overrides: Partial<Record<string, Row[]>> = {}) => ({
    reimbursement: [pendingRequest],
    reimbursementLineItem: [lineItem()],
    ...overrides,
  });
  const collect = (
    db: ReturnType<typeof createDb>,
    ctx: Row | Context,
    overrides: Row = {}
  ) =>
    reimbursementMutators.collectPayeeSignature.fn({
      args: {
        attachmentId: "att-sig",
        lineItemId: "li-1",
        objectKey: `app/attachments/tmp/${String(ctx.userId)}/payee-signature.png`,
        reimbursementId: "request-1",
        replacesAttachmentId: null,
        signedFacts: {
          amountPaise: 50_000,
          categoryId: "cat-1",
          description: "Cleaning",
          expenseDay: "2026-10-01",
          payeeName: "Test Payee",
        },
        ...overrides,
      },
      ctx,
      tx: db.tx,
    } as never);

  it("stores the PNG, the statement, the time and the collector", async () => {
    const db = createDb("client", seed());
    await collect(db, owner);
    const attachment = db.inserts.find(
      (i) => i.table === "reimbursementAttachment"
    )?.row;
    expect(attachment).toMatchObject({
      filename: "payee-signature.png",
      id: "att-sig",
      mimeType: "image/png",
      type: "file",
    });
    const update = db.updates.find(
      (u) => u.table === "reimbursementLineItem"
    )?.row;
    expect(update).toMatchObject({
      id: "li-1",
      payeeSignatureAttachmentId: "att-sig",
      payeeSignatureCapturedBy: "owner-1",
      payeeSignatureStatement: STATEMENT,
    });
    expect(typeof update?.payeeSignatureCapturedAt).toBe("number");
    const history = db.inserts.find(
      (i) => i.table === "reimbursementHistory"
    )?.row;
    expect(history?.note).toBe("Payee signature collected from Test Payee");
    expect(history?.metadata).toMatchObject({
      attachmentId: "att-sig",
      lineItemId: "li-1",
      statement: STATEMENT,
    });
  });

  it("states the payee, amount, purpose and day", () => {
    expect(STATEMENT).toBe(
      "I, Test Payee, received ₹500 from Proud Indian for Cleaning on 1 Oct 2026."
    );
  });

  it.each([
    ["finance", ["finance.manage"]],
    ["an approver", ["requests.approve"]],
  ])("lets %s collect it", async (_, permissions) => {
    await expect(
      collect(createDb("client", seed()), {
        permissions,
        role: "admin",
        userId: "staff-1",
      })
    ).resolves.toBeUndefined();
  });

  it("refuses another volunteer", async () => {
    await expect(
      collect(createDb("client", seed()), {
        permissions: ["requests.edit_own", "requests.create"],
        role: "volunteer",
        userId: "vol-2",
      })
    ).rejects.toThrow("Unauthorized");
  });

  it("is locked once the request is approved", async () => {
    await expect(
      collect(
        createDb(
          "client",
          seed({ reimbursement: [{ ...pendingRequest, status: "approved" }] })
        ),
        owner
      )
    ).rejects.toThrow(
      "The payee signature is locked once the request is approved"
    );
  });

  it("can be collected on a rejected request", async () => {
    await expect(
      collect(
        createDb(
          "client",
          seed({ reimbursement: [{ ...pendingRequest, status: "rejected" }] })
        ),
        owner
      )
    ).resolves.toBeUndefined();
  });

  it("refuses a voided request", async () => {
    await expect(
      collect(
        createDb(
          "client",
          seed({
            reimbursement: [
              { ...pendingRequest, voidReason: "x", voidedAt: 1 },
            ],
          })
        ),
        owner
      )
    ).rejects.toThrow();
  });

  it("needs no signature when the claimant was paid", async () => {
    await expect(
      collect(
        createDb(
          "client",
          seed({
            reimbursementLineItem: [
              lineItem({ payeeName: null, payeePhone: null }),
            ],
          })
        ),
        owner
      )
    ).rejects.toThrow("Paid to the claimant, so no payee signature is needed");
  });

  it("takes signatures only on cash voucher items", async () => {
    for (const item of [
      lineItem({ generateVoucher: false }),
      lineItem({ amountPaise: 150_000 }),
    ]) {
      await expect(
        collect(
          createDb("client", seed({ reimbursementLineItem: [item] })),
          owner
        )
      ).rejects.toThrow("Only cash voucher items take a payee signature");
    }
  });

  it("refuses a signature given against facts the item no longer has", async () => {
    await expect(
      collect(
        createDb(
          "client",
          seed({ reimbursementLineItem: [lineItem({ amountPaise: 60_000 })] })
        ),
        owner
      )
    ).rejects.toThrow("The item changed while the payee was signing");
  });

  it("re-collects and keeps the earlier file", async () => {
    const db = createDb(
      "client",
      seed({
        reimbursementAttachment: [{ id: "att-old", objectKey: "old" }],
        reimbursementLineItem: [
          lineItem({ payeeSignatureAttachmentId: "att-old" }),
        ],
      })
    );
    await collect(db, owner, { replacesAttachmentId: "att-old" });
    expect(db.deletes).toEqual([]);
    expect(
      db.inserts.find((i) => i.table === "reimbursementHistory")?.row.note
    ).toBe("Payee signature collected again from Test Payee");
  });

  it("refuses a re-collect racing another", async () => {
    await expect(
      collect(
        createDb(
          "client",
          seed({
            reimbursementLineItem: [
              lineItem({ payeeSignatureAttachmentId: "att-other" }),
            ],
          })
        ),
        owner,
        { replacesAttachmentId: "att-old" }
      )
    ).rejects.toThrow("The payee signature changed meanwhile");
  });

  it("claims the upload as a PNG on the server", async () => {
    const ctx = serverContext("owner-1");
    await collect(createDb("server", seed()), ctx);
    expect(ctx.beforeCommitTasks).toHaveLength(1);
    await ctx.beforeCommitTasks?.[0]?.fn();
    expect(ctx.copyR2Object).toHaveBeenCalledWith(
      expect.objectContaining({
        contentCheck: "payeeSignature",
        mimeType: "image/png",
      })
    );
  });

  it("refuses an upload key another attachment already holds", async () => {
    // The temporary key was claimed before, so its durable key is taken.
    const db = createDb(
      "server",
      seed({
        reimbursementAttachment: [
          {
            id: "att-other",
            objectKey:
              "app/attachments/reimbursements/request-1/payee-signature.png",
            reimbursementId: "request-1",
          },
        ],
      })
    );
    await expect(collect(db, serverContext("owner-1"))).rejects.toThrow(
      "This upload was already used"
    );
  });

  it("re-checks the status under a row lock on the server", async () => {
    // Synced as pending, but approved by the time the lock is taken.
    const db = createDb("server", seed(), {
      ...pendingRequest,
      status: "approved",
    });
    await expect(collect(db, serverContext("owner-1"))).rejects.toThrow(
      "The payee signature is locked once the request is approved"
    );
    expect(db.lockReads).toHaveLength(1);
    expect(db.inserts).toEqual([]);
  });

  it.each([
    ["another user's upload", "app/attachments/tmp/someone-else/sig.png"],
    ["a durable key", "app/attachments/reimbursements/request-2/sig.png"],
  ])("refuses %s on the server", async (_, objectKey) => {
    await expect(
      collect(createDb("server", seed()), serverContext("owner-1"), {
        objectKey,
      })
    ).rejects.toThrow("Invalid attachment object key");
  });
});

describe("reimbursement.update and the payee signature", () => {
  const file = (id: string, objectKey: string) => ({
    filename: `${id}.png`,
    id,
    objectKey,
    reimbursementId: "request-1",
    type: "file" as const,
  });
  const signed = lineItem({
    payeeSignatureAttachmentId: "att-sig",
    payeeSignatureCapturedAt: 1_000,
    payeeSignatureCapturedBy: "owner-1",
    payeeSignatureStatement: STATEMENT,
  });
  const seed = () => ({
    reimbursement: [pendingRequest],
    reimbursementAttachment: [file("att-sig", SIGNATURE_KEY)],
    reimbursementLineItem: [signed],
  });
  const args = (item: Row = {}, overrides: Row = {}) => ({
    attachments: [file("att-sig", SIGNATURE_KEY)],
    chargedTo: "organisation",
    city: "bangalore",
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
        ...item,
      },
    ],
    title: "Hall clean-up",
    ...overrides,
  });
  const edit = async (editArgs: Row) => {
    const db = createDb("client", seed());
    await reimbursementMutators.update.fn({
      args: createSchema.parse(editArgs),
      ctx: { ...owner, permissions: ["requests.edit_own"] },
      tx: db.tx,
    } as never);
    const inserted = db.inserts.find(
      (i) => i.table === "reimbursementLineItem"
    )?.row;
    const restored = db.updates
      .filter((u) => u.table === "reimbursementLineItem")
      .map((u) => u.row);
    const notes = db.inserts
      .filter((i) => i.table === "reimbursementHistory")
      .map((i) => i.row.note);
    return { inserted, notes, restored };
  };

  it("keeps the signature of an unchanged item", async () => {
    const { inserted, notes, restored } = await edit(args());
    expect(inserted?.payeeSignatureAttachmentId).toBeNull();
    expect(restored).toEqual([
      {
        id: "li-1",
        payeeSignatureAttachmentId: "att-sig",
        payeeSignatureCapturedAt: 1_000,
        payeeSignatureCapturedBy: "owner-1",
        payeeSignatureStatement: STATEMENT,
      },
    ]);
    expect(notes).not.toContain(
      "Payee signature cleared: the item changed after it was signed"
    );
  });

  it("keeps it when only the title changes", async () => {
    const { restored } = await edit(args({}, { title: "Hall clean-up (Oct)" }));
    expect(restored).toHaveLength(1);
  });

  it.each([
    ["the amount", { amountPaise: 60_000 }, {}],
    ["the description", { description: "Cleaning twice" }, {}],
    ["the category", { categoryId: "cat-2" }, {}],
    ["the payee", { payeeName: "Other Payee" }, {}],
    ["the payee's mobile", { payeePhone: "+919999999999" }, {}],
    ["paid to the claimant", { payeeIsClaimant: true }, {}],
    ["the voucher tick", { generateVoucher: false }, {}],
    ["the expense day", {}, { expenseDate: EXPENSE_DATE - 86_400_000 }],
  ])(
    "clears it when %s changes, keeping the file",
    async (_, item, request) => {
      const { notes, restored } = await edit(args(item, request));
      expect(restored).toEqual([]);
      expect(notes).toContain(
        "Payee signature cleared: the item changed after it was signed"
      );
    }
  );

  it("keeps it when the same day is picked at another time", async () => {
    const { restored } = await edit(
      args({}, { expenseDate: EXPENSE_DATE + 3_600_000 })
    );
    expect(restored).toHaveLength(1);
  });

  it("drops a voucher that printed a signature an untick cleared", async () => {
    const db = createDb("client", {
      reimbursement: [{ ...pendingRequest, status: "approved" }],
      reimbursementAttachment: [
        file("att-sig", SIGNATURE_KEY),
        file("att-voucher", "app/vouchers/request-1/v.pdf"),
      ],
      reimbursementLineItem: [
        { ...signed, voucherAttachmentId: "att-voucher" },
      ],
    });
    await reimbursementMutators.update.fn({
      args: createSchema.parse(
        args(
          { generateVoucher: false },
          {
            attachments: [
              file("att-sig", SIGNATURE_KEY),
              file("att-voucher", "app/vouchers/request-1/v.pdf"),
            ],
          }
        )
      ),
      ctx: {
        permissions: ["requests.edit_all_statuses"],
        role: "admin",
        userId: "admin-1",
      },
      tx: db.tx,
    } as never);
    expect(
      db.updates.filter((u) => u.table === "reimbursementLineItem")
    ).toEqual([]);
  });

  it("keeps the signature and its file when the edit form drops the file", async () => {
    const db = createDb("client", seed());
    await reimbursementMutators.update.fn({
      args: createSchema.parse(args({}, { attachments: [] })),
      ctx: { ...owner, permissions: ["requests.edit_own"] },
      tx: db.tx,
    } as never);
    expect(
      db.inserts
        .filter((i) => i.table === "reimbursementAttachment")
        .map((i) => i.row)
    ).toEqual([
      expect.objectContaining({ id: "att-sig", objectKey: SIGNATURE_KEY }),
    ]);
    expect(
      db.updates.find((u) => u.table === "reimbursementLineItem")?.row
        .payeeSignatureAttachmentId
    ).toBe("att-sig");
  });

  it("keeps the signature and stored payee after the limit was lowered", async () => {
    // ₹400 limit: the ₹500 item can't show the voucher box, so the form
    // sends no tick and no payee.
    const db = createDb("client", {
      ...seed(),
      appConfig: [{ key: "cash_voucher_limit_paise", value: "40000" }],
    });
    await reimbursementMutators.update.fn({
      args: createSchema.parse(
        args({ generateVoucher: false, payeeName: null, payeePhone: null })
      ),
      ctx: { ...owner, permissions: ["requests.edit_own"] },
      tx: db.tx,
    } as never);
    expect(
      db.inserts.find((i) => i.table === "reimbursementLineItem")?.row
    ).toMatchObject({
      generateVoucher: true,
      payeeName: "Test Payee",
      payeePhone: "+919876543210",
    });
    expect(
      db.updates.find((u) => u.table === "reimbursementLineItem")?.row
        .payeeSignatureAttachmentId
    ).toBe("att-sig");
  });

  it("locks the request before reading its items on the server", async () => {
    const db = createDb("server", seed());
    const ctx = { ...serverContext("owner-1", ["requests.edit_own"]) };
    await reimbursementMutators.update.fn({
      args: createSchema.parse(args()),
      ctx,
      tx: db.tx,
    } as never);
    expect(db.lockReads).toHaveLength(1);
  });
});
