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
import { reimbursementMutators } from "../reimbursement";

type Row = Record<string, unknown>;

const UPLOAD_KEY = "app/approval-screenshots/tmp/approver-1/upi-proof.png";
const OLD_KEY =
  "app/approval-screenshots/reimbursements/request-1/approval-screenshots/old.png";

function createDb(
  location: "client" | "server",
  seed: Partial<Record<string, Row[]>> = {}
) {
  const tables: Record<string, Row[]> = {
    reimbursement: [],
    reimbursementAttachment: [],
    reimbursementHistory: [],
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
  const tx = {
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

const serverContext = (
  permissions: string[] = ["requests.approve"]
): Context => ({
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

const claim = (overrides: Row = {}): Row => ({
  approvalScreenshotKey: null,
  id: "request-1",
  status: "approved",
  title: "Class outing",
  userId: "owner-1",
  voidedAt: null,
  ...overrides,
});

const addProof = (
  db: ReturnType<typeof createDb>,
  ctx: Context,
  overrides: Row = {}
) =>
  reimbursementMutators.addPaymentProof.fn({
    args: {
      approvalScreenshotKey: UPLOAD_KEY,
      id: "request-1",
      replacing: false,
      ...overrides,
    },
    ctx,
    tx: db.tx,
  } as never);

beforeEach(() => {
  enqueue.mockReset();
});

describe("reimbursement.addPaymentProof", () => {
  it("stores the screenshot where approval stores it and notes it in the history", async () => {
    const db = createDb("server", { reimbursement: [claim()] });
    await addProof(db, serverContext());

    const update = db.updates.find((u) => u.table === "reimbursement")?.row;
    expect(update).toMatchObject({ id: "request-1" });
    expect(String(update?.approvalScreenshotKey)).toStartWith(
      "app/approval-screenshots/reimbursements/request-1/approval-screenshots/"
    );
    expect(
      db.inserts.find((i) => i.table === "reimbursementHistory")?.row
    ).toMatchObject({ action: "updated", note: "Payment proof added" });
    // Nothing to keep: no attachment, and nothing deleted.
    expect(
      db.inserts.filter((i) => i.table === "reimbursementAttachment")
    ).toEqual([]);
    expect(db.deletes).toEqual([]);
  });

  it("queues the posting job after the commit, keyed by the claim", async () => {
    const ctx = serverContext();
    const db = createDb("server", { reimbursement: [claim()] });
    await addProof(db, ctx);

    const task = ctx.asyncTasks?.find(
      (t) => t.meta.mutator === "reimbursement.addPaymentProof"
    );
    expect(task?.meta).toMatchObject({
      sourceId: "request-1",
      sourceType: "reimbursement",
    });
    await task?.fn();
    expect(ctx.enqueue).toHaveBeenCalledWith(
      "ledger-post-source",
      { sourceId: "request-1", sourceType: "reimbursement" },
      { singletonKey: "reimbursement:request-1", traceId: "trace-1" }
    );
  });

  it("queues nothing on the client", async () => {
    const ctx = serverContext();
    const db = createDb("client", { reimbursement: [claim()] });
    await addProof(db, ctx, {
      approvalScreenshotKey:
        "pi-dash/approval-screenshots/tmp/approver-1/a.png",
    });
    expect(ctx.asyncTasks).toEqual([]);
    expect(db.updates).toHaveLength(1);
  });

  it("needs requests.approve", async () => {
    for (const permissions of [[], ["requests.create", "finance.view"]]) {
      const db = createDb("server", { reimbursement: [claim()] });
      await expect(addProof(db, serverContext(permissions))).rejects.toThrow(
        "Unauthorized"
      );
      expect(db.updates).toEqual([]);
    }
  });

  it("takes proof only on an approved claim that isn't void", async () => {
    for (const status of ["pending", "rejected"]) {
      const db = createDb("server", { reimbursement: [claim({ status })] });
      await expect(addProof(db, serverContext())).rejects.toThrow(
        "Only an approved reimbursement takes payment proof"
      );
    }
    const voided = createDb("server", {
      reimbursement: [claim({ voidedAt: Date.now() })],
    });
    await expect(addProof(voided, serverContext())).rejects.toThrow(
      "This is void, so it can't be changed"
    );
    await expect(addProof(createDb("server"), serverContext())).rejects.toThrow(
      "Reimbursement"
    );
  });

  it("refuses an upload that isn't the approver's own temporary upload", async () => {
    const db = createDb("server", { reimbursement: [claim()] });
    await expect(
      addProof(db, serverContext(), {
        approvalScreenshotKey:
          "app/approval-screenshots/tmp/someone-else/a.png",
      })
    ).rejects.toThrow("Invalid attachment object key");
    expect(db.updates).toEqual([]);
  });

  it("replaces the proof and keeps the old file as a plain attachment", async () => {
    const ctx = serverContext();
    const db = createDb("server", {
      reimbursement: [claim({ approvalScreenshotKey: OLD_KEY })],
    });
    await addProof(db, ctx, { keptAttachmentId: "att-kept", replacing: true });

    expect(
      db.inserts.find((i) => i.table === "reimbursementAttachment")?.row
    ).toMatchObject({
      filename: "payment-proof-replaced.png",
      id: "att-kept",
      mimeType: "image/png",
      objectKey: OLD_KEY,
      reimbursementId: "request-1",
      type: "file",
      url: null,
    });
    expect(
      db.inserts.find((i) => i.table === "reimbursementHistory")?.row.note
    ).toBe("Payment proof replaced");
    expect(db.deletes).toEqual([]);
    // The old object is never queued for deletion (only the temporary
    // upload goes, once copied).
    await Promise.all(ctx.asyncTasks?.map((t) => t.fn()) ?? []);
    const deleted = (ctx.enqueue as ReturnType<typeof mock>).mock.calls
      .filter(([name]) => name === "delete-r2-object")
      .map(([, payload]) => (payload as { r2Key: string }).r2Key);
    expect(deleted).not.toContain(OLD_KEY);
  });

  it("refuses a replace without somewhere to keep the old file", async () => {
    const db = createDb("server", {
      reimbursement: [claim({ approvalScreenshotKey: OLD_KEY })],
    });
    await expect(
      addProof(db, serverContext(), { replacing: true })
    ).rejects.toThrow("Replacing the payment proof keeps the old one");
  });

  it("refuses when the proof changed since the client looked", async () => {
    const added = createDb("server", {
      reimbursement: [claim({ approvalScreenshotKey: OLD_KEY })],
    });
    await expect(addProof(added, serverContext())).rejects.toThrow(
      "The payment proof changed meanwhile"
    );
    const removed = createDb("server", { reimbursement: [claim()] });
    await expect(
      addProof(removed, serverContext(), {
        keptAttachmentId: "att-kept",
        replacing: true,
      })
    ).rejects.toThrow("The payment proof changed meanwhile");
  });
});
