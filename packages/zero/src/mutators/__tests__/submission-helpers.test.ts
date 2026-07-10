import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncTask } from "../../context";
import {
  assertCanDelete,
  assertCanModify,
  assertEntityExists,
  assertPending,
  buildAttachmentInsert,
  buildHistoryInsert,
  buildLineItemInsert,
  claimUploadedR2ObjectKey,
  deleteAllRelations,
  enqueueDeleteR2Object,
  replaceRelations,
} from "../submission-helpers";

const copyR2Object = vi.fn();
const enqueue = vi.fn();
const clientClaimOptions = {
  durablePrefix: "reimbursements/request-1",
  subfolder: "attachments" as const,
  txLocation: "client",
  userId: "user-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertEntityExists", () => {
  it("passes when entity is defined", () => {
    expect(() => assertEntityExists({ id: "1" }, "Thing")).not.toThrow();
  });

  it("throws when entity is undefined", () => {
    expect(() => assertEntityExists(undefined, "Thing")).toThrow(
      "Thing not found"
    );
  });
});

describe("assertPending", () => {
  it("passes when status is pending", () => {
    expect(() =>
      assertPending({ status: "pending" }, "reimbursement", "approved")
    ).not.toThrow();
  });

  it("throws when status is approved", () => {
    expect(() =>
      assertPending({ status: "approved" }, "reimbursement", "approved")
    ).toThrow("Only pending reimbursements can be approved");
  });

  it("throws when status is rejected", () => {
    expect(() =>
      assertPending({ status: "rejected" }, "reimbursement", "deleted")
    ).toThrow("Only pending reimbursements can be deleted");
  });

  it("throws when status is null", () => {
    expect(() =>
      assertPending({ status: null }, "reimbursement", "approved")
    ).toThrow("Only pending reimbursements can be approved");
  });

  it("passes when status bypass is enabled", () => {
    expect(() =>
      assertPending({ status: "approved" }, "reimbursement", "rejected", true)
    ).not.toThrow();
  });
});

describe("assertCanModify", () => {
  it("passes for owner with pending status and edit permission", () => {
    expect(() =>
      assertCanModify(
        { status: "pending", userId: "user-1" },
        "user-1",
        false,
        "reimbursement",
        false,
        true
      )
    ).not.toThrow();
  });

  it("throws for owner with pending status without edit permission", () => {
    expect(() =>
      assertCanModify(
        { status: "pending", userId: "user-1" },
        "user-1",
        false,
        "reimbursement",
        false,
        false
      )
    ).toThrow("Unauthorized");
  });

  it("passes for admin with pending status", () => {
    expect(() =>
      assertCanModify(
        { status: "pending", userId: "user-1" },
        "admin-1",
        true,
        "reimbursement"
      )
    ).not.toThrow();
  });

  it("throws unauthorized when not owner and not admin", () => {
    expect(() =>
      assertCanModify(
        { status: "pending", userId: "user-1" },
        "user-2",
        false,
        "reimbursement"
      )
    ).toThrow("Unauthorized");
  });

  it("throws when not pending even if owner", () => {
    expect(() =>
      assertCanModify(
        { status: "approved", userId: "user-1" },
        "user-1",
        false,
        "reimbursement"
      )
    ).toThrow("Only pending reimbursements can be updated");
  });

  it("throws when not pending even if admin", () => {
    expect(() =>
      assertCanModify(
        { status: "approved", userId: "user-1" },
        "admin-1",
        true,
        "reimbursement"
      )
    ).toThrow("Only pending reimbursements can be updated");
  });

  it("passes for admin with non-pending status when status bypass is enabled", () => {
    expect(() =>
      assertCanModify(
        { status: "approved", userId: "user-1" },
        "admin-1",
        true,
        "reimbursement",
        true
      )
    ).not.toThrow();
  });
});

describe("assertCanDelete", () => {
  it("passes for admin regardless of status", () => {
    expect(() =>
      assertCanDelete({ status: "approved", userId: "user-1" }, "admin-1", true)
    ).not.toThrow();
  });

  it("passes for owner with pending status", () => {
    expect(() =>
      assertCanDelete({ status: "pending", userId: "user-1" }, "user-1", false)
    ).not.toThrow();
  });

  it("throws for owner with non-pending status", () => {
    expect(() =>
      assertCanDelete({ status: "approved", userId: "user-1" }, "user-1", false)
    ).toThrow("Unauthorized");
  });

  it("throws for non-owner non-admin", () => {
    expect(() =>
      assertCanDelete({ status: "pending", userId: "user-1" }, "user-2", false)
    ).toThrow("Unauthorized");
  });
});

describe("buildLineItemInsert", () => {
  it("returns correct shape", () => {
    const now = 1_700_000_000_000;
    const result = buildLineItemInsert(
      {
        amount: 500,
        categoryId: "cat-1",
        description: "Test item",
        generateVoucher: false,
        id: "li-1",
        sortOrder: 0,
      },
      now
    );
    expect(result).toEqual({
      amount: 500,
      categoryId: "cat-1",
      createdAt: now,
      description: "Test item",
      id: "li-1",
      sortOrder: 0,
      updatedAt: now,
    });
  });
});

describe("buildAttachmentInsert", () => {
  it("returns correct shape for file type", () => {
    const now = 1_700_000_000_000;
    const result = buildAttachmentInsert(
      {
        filename: "file.pdf",
        id: "att-1",
        mimeType: "application/pdf",
        objectKey: "uploads/file.pdf",
        type: "file",
      },
      now
    );
    expect(result).toEqual({
      createdAt: now,
      filename: "file.pdf",
      id: "att-1",
      mimeType: "application/pdf",
      objectKey: "uploads/file.pdf",
      type: "file",
      url: null,
    });
  });

  it("returns correct shape for url type", () => {
    const now = 1_700_000_000_000;
    const result = buildAttachmentInsert(
      {
        id: "att-2",
        type: "url",
        url: "https://example.com/doc",
      },
      now
    );
    expect(result).toEqual({
      createdAt: now,
      filename: null,
      id: "att-2",
      mimeType: null,
      objectKey: null,
      type: "url",
      url: "https://example.com/doc",
    });
  });
});

describe("buildHistoryInsert", () => {
  it("returns correct shape with note", () => {
    const now = 1_700_000_000_000;
    const result = buildHistoryInsert("actor-1", "approved", now, "Looks good");
    expect(result).toMatchObject({
      action: "approved",
      actorId: "actor-1",
      createdAt: now,
      metadata: null,
      note: "Looks good",
    });
    expect(result.id).toBeDefined();
  });

  it("returns null note when omitted", () => {
    const now = 1_700_000_000_000;
    const result = buildHistoryInsert("actor-1", "created", now);
    expect(result.note).toBeNull();
  });
});

describe("claimUploadedR2ObjectKey", () => {
  it("claims the current user's temp key under the durable parent", () => {
    expect(
      claimUploadedR2ObjectKey(
        "app/attachments/tmp/user-1/upload-id-receipt.pdf",
        clientClaimOptions
      )
    ).toBe("app/attachments/reimbursements/request-1/upload-id-receipt.pdf");
  });

  it("queues copy before commit and source deletion after commit", async () => {
    const beforeCommitTasks: AsyncTask[] = [];
    const asyncTasks: AsyncTask[] = [];
    const rollbackTasks: AsyncTask[] = [];
    const lockR2Object = vi.fn();
    const sourceKey = "app/attachments/tmp/user-1/upload-id-receipt.pdf";
    const targetKey =
      "app/attachments/reimbursements/request-1/upload-id-receipt.pdf";

    expect(
      claimUploadedR2ObjectKey(sourceKey, {
        ...clientClaimOptions,
        asyncTasks,
        beforeCommitTasks,
        copyR2Object,
        enqueue,
        lockR2Object,
        mimeType: "application/pdf",
        r2KeyPrefix: "app",
        rollbackTasks,
        traceId: "trace-id",
        txLocation: "server",
      })
    ).toBe(targetKey);

    expect(beforeCommitTasks).toHaveLength(1);
    expect(asyncTasks).toHaveLength(1);
    await beforeCommitTasks[0]?.fn();
    expect(lockR2Object).toHaveBeenCalledWith(targetKey);
    expect(copyR2Object).toHaveBeenCalledWith({
      mimeType: "application/pdf",
      sourceKey,
      targetKey,
    });
    expect(enqueue).not.toHaveBeenCalled();

    expect(rollbackTasks).toHaveLength(1);
    await rollbackTasks[0]?.fn();
    expect(enqueue).toHaveBeenCalledWith(
      "delete-r2-object",
      { deleteIfUnreferenced: true, r2Key: targetKey },
      { startAfter: "30 seconds", traceId: "trace-id" }
    );
    enqueue.mockClear();

    await asyncTasks[0]?.fn();
    expect(enqueue).toHaveBeenCalledWith(
      "delete-r2-object",
      { deleteIfUnreferenced: false, r2Key: sourceKey },
      { traceId: "trace-id" }
    );
  });

  it("locks and revalidates an existing durable key before commit", async () => {
    const beforeCommitTasks: AsyncTask[] = [];
    const asyncTasks: AsyncTask[] = [];
    const key = "app/attachments/reimbursements/request-1/receipt.pdf";
    const lockR2Object = vi.fn();

    expect(
      claimUploadedR2ObjectKey(key, {
        ...clientClaimOptions,
        asyncTasks,
        beforeCommitTasks,
        copyR2Object,
        enqueue,
        existingObjectKeys: new Set([key]),
        lockR2Object,
        r2KeyPrefix: "app",
        txLocation: "server",
      })
    ).toBe(key);
    expect(beforeCommitTasks).toHaveLength(1);
    expect(asyncTasks).toEqual([]);

    await beforeCommitTasks[0]?.fn();
    expect(lockR2Object).toHaveBeenCalledWith(key);
    expect(copyR2Object).toHaveBeenCalledWith({
      sourceKey: key,
      targetKey: key,
    });
    expect(lockR2Object.mock.invocationCallOrder[0]).toBeLessThan(
      copyR2Object.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("retains a trusted legacy key that predates the configured prefix", async () => {
    const beforeCommitTasks: AsyncTask[] = [];
    const key = "legacy/attachments/request-1/receipt.pdf";
    const lockR2Object = vi.fn();

    expect(
      claimUploadedR2ObjectKey(key, {
        ...clientClaimOptions,
        asyncTasks: [],
        beforeCommitTasks,
        copyR2Object,
        enqueue,
        existingObjectKeys: new Set([key]),
        lockR2Object,
        r2KeyPrefix: "app",
        txLocation: "server",
      })
    ).toBe(key);

    await beforeCommitTasks[0]?.fn();
    expect(lockR2Object).toHaveBeenCalledWith(key);
    expect(copyR2Object).toHaveBeenCalledWith({
      sourceKey: key,
      targetKey: key,
    });
  });

  it("rejects another user's temp key", () => {
    expect(() =>
      claimUploadedR2ObjectKey(
        "app/attachments/tmp/other-user/upload-id-receipt.pdf",
        clientClaimOptions
      )
    ).toThrow("Invalid attachment object key");
  });

  it.each([
    "app/attachments/tmp/other-user/upload-id-receipt.pdf",
    "app/photos/tmp/user-1/upload-id-receipt.pdf",
    "other/attachments/tmp/user-1/upload-id-receipt.pdf",
  ])("rejects an unowned server key before queueing work: %s", (key) => {
    const beforeCommitTasks: AsyncTask[] = [];
    const asyncTasks: AsyncTask[] = [];

    expect(() =>
      claimUploadedR2ObjectKey(key, {
        ...clientClaimOptions,
        asyncTasks,
        beforeCommitTasks,
        copyR2Object,
        enqueue,
        r2KeyPrefix: "app",
        txLocation: "server",
      })
    ).toThrow("Invalid attachment object key");
    expect(beforeCommitTasks).toEqual([]);
    expect(asyncTasks).toEqual([]);
  });
});

describe("enqueueDeleteR2Object", () => {
  it("queues persisted deletion only for a server mutation", async () => {
    const asyncTasks: AsyncTask[] = [];
    enqueueDeleteR2Object(
      {
        asyncTasks,
        enqueue,
        r2KeyPrefix: "app",
        traceId: "trace-id",
      },
      "server",
      "app/attachments/reimbursements/request-1/receipt.pdf",
      {
        keyPrefixes: ["attachments/reimbursements/request-1/"],
        meta: { mutator: "reimbursement.delete", requestId: "request-1" },
      }
    );

    expect(asyncTasks).toHaveLength(1);
    await asyncTasks[0]?.fn();
    expect(enqueue).toHaveBeenCalledWith(
      "delete-r2-object",
      {
        deleteIfUnreferenced: true,
        r2Key: "app/attachments/reimbursements/request-1/receipt.pdf",
      },
      { startAfter: "30 seconds", traceId: "trace-id" }
    );
  });

  it("accepts a parent-bound legacy key", async () => {
    const asyncTasks: AsyncTask[] = [];
    enqueueDeleteR2Object(
      { asyncTasks, enqueue, r2KeyPrefix: "app" },
      "server",
      "app/attachments/request-1/receipt.pdf",
      {
        keyPrefixes: [
          "attachments/reimbursements/request-1/",
          "attachments/request-1/",
        ],
        meta: { mutator: "reimbursement.delete" },
      }
    );

    expect(asyncTasks).toHaveLength(1);
    await asyncTasks[0]?.fn();
    expect(enqueue).toHaveBeenCalledWith(
      "delete-r2-object",
      {
        deleteIfUnreferenced: true,
        r2Key: "app/attachments/request-1/receipt.pdf",
      },
      { startAfter: "30 seconds", traceId: undefined }
    );
  });

  it("does not enqueue a key outside the owning parent", () => {
    const asyncTasks: AsyncTask[] = [];
    enqueueDeleteR2Object(
      { asyncTasks, enqueue, r2KeyPrefix: "app" },
      "server",
      "app/attachments/reimbursements/other-request/receipt.pdf",
      {
        keyPrefixes: [
          "attachments/reimbursements/request-1/",
          "attachments/request-1/",
        ],
        meta: { mutator: "reimbursement.delete" },
      }
    );

    expect(asyncTasks).toEqual([]);
  });
});

describe("relation attachment cleanup callbacks", () => {
  const baseOps = {
    deleteAttachment: () => Promise.resolve(),
    deleteLineItem: () => Promise.resolve(),
    insertAttachment: () => Promise.resolve(),
    insertHistory: () => Promise.resolve(),
    insertLineItem: () => Promise.resolve(),
    queryLineItems: () => Promise.resolve([]),
  };

  it("deletes only dropped attachment object keys during replacement", async () => {
    const deleted: string[] = [];
    const retainedKey = "app/attachments/reimbursements/request-1/keep.pdf";
    const droppedKey = "app/attachments/reimbursements/request-1/drop.pdf";

    await replaceRelations(
      { reimbursementId: "request-1" },
      [],
      [
        {
          filename: "keep.pdf",
          id: "keep",
          mimeType: "application/pdf",
          objectKey: retainedKey,
          type: "file",
        },
      ],
      "user-1",
      1,
      {
        ...baseOps,
        onDeleteAttachmentObjectKey: (key) => deleted.push(key),
        queryAttachments: () =>
          Promise.resolve([
            { id: "keep", objectKey: retainedKey },
            { id: "drop", objectKey: droppedKey },
          ]),
      },
      clientClaimOptions
    );

    expect(deleted).toEqual([droppedKey]);
  });

  it("deletes all attachment object keys with their relations", async () => {
    const deleted: string[] = [];
    await deleteAllRelations({
      deleteAttachment: () => Promise.resolve(),
      deleteHistory: () => Promise.resolve(),
      deleteLineItem: () => Promise.resolve(),
      onDeleteAttachmentObjectKey: (key) => deleted.push(key),
      queryAttachments: () =>
        Promise.resolve([
          {
            id: "attachment-1",
            objectKey: "app/attachments/reimbursements/request-1/file.pdf",
          },
        ]),
      queryHistory: () => Promise.resolve([]),
      queryLineItems: () => Promise.resolve([]),
    });
    expect(deleted).toEqual([
      "app/attachments/reimbursements/request-1/file.pdf",
    ]);
  });
});
