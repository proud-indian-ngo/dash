import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncTask } from "../../context";

const jobMocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
}));
const r2ObjectMocks = vi.hoisted(() => ({
  moveR2Object: vi.fn(),
}));

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
  const baseOptions = {
    durablePrefix: "reimbursements/request-1",
    moveR2Object: r2ObjectMocks.moveR2Object,
    subfolder: "attachments" as const,
    txLocation: "client",
    userId: "user-1",
  };

  it("claims current user temp uploads under durable prefix", () => {
    expect(
      claimUploadedR2ObjectKey(
        "app/attachments/tmp/user-1/uploaded-file.pdf",
        baseOptions
      )
    ).toBe("app/attachments/reimbursements/request-1/uploaded-file.pdf");
  });

  it("preserves upload ids when claiming duplicate filenames", () => {
    expect(
      claimUploadedR2ObjectKey(
        "app/attachments/tmp/user-1/upload-1-receipt.pdf",
        baseOptions
      )
    ).toBe("app/attachments/reimbursements/request-1/upload-1-receipt.pdf");

    expect(
      claimUploadedR2ObjectKey(
        "app/attachments/tmp/user-1/upload-2-receipt.pdf",
        baseOptions
      )
    ).toBe("app/attachments/reimbursements/request-1/upload-2-receipt.pdf");
  });

  it("claims event photo temp uploads under the event prefix", () => {
    expect(
      claimUploadedR2ObjectKey("app/photos/tmp/user-1/photo.jpg", {
        durablePrefix: "event-id",
        subfolder: "photos",
        txLocation: "client",
        userId: "user-1",
      })
    ).toBe("app/photos/event-id/photo.jpg");
  });

  it("allows existing persisted object keys during relation replacement", () => {
    expect(
      claimUploadedR2ObjectKey("app/attachments/existing/file.pdf", {
        ...baseOptions,
        existingObjectKeys: new Set(["app/attachments/existing/file.pdf"]),
      })
    ).toBe("app/attachments/existing/file.pdf");
  });

  it("rejects keys outside current user's temp prefix", () => {
    expect(() =>
      claimUploadedR2ObjectKey(
        "app/attachments/tmp/other-user/uploaded-file.pdf",
        baseOptions
      )
    ).toThrow("Invalid attachment object key");
  });

  it("rejects server keys that only contain the temp marker later in the path", () => {
    expect(() =>
      claimUploadedR2ObjectKey(
        "app/other/attachments/tmp/user-1/uploaded-file.pdf",
        {
          ...baseOptions,
          asyncTasks: [],
          r2KeyPrefix: "app",
          txLocation: "server",
        }
      )
    ).toThrow("Invalid attachment object key");
  });

  it("moves server temp upload to durable key when task runs", async () => {
    const asyncTasks: AsyncTask[] = [];

    expect(
      claimUploadedR2ObjectKey("app/attachments/tmp/user-1/uploaded-file.pdf", {
        ...baseOptions,
        asyncTasks,
        mimeType: "application/pdf",
        r2KeyPrefix: "app",
        traceId: "trace-id",
        txLocation: "server",
      })
    ).toBe("app/attachments/reimbursements/request-1/uploaded-file.pdf");

    expect(jobMocks.enqueue).not.toHaveBeenCalled();
    expect(asyncTasks).toHaveLength(1);
    expect(asyncTasks[0]?.blocking).toBe(true);
    expect(asyncTasks[0]?.meta).toEqual({
      mutator: "claim-r2-object",
      sourceKey: "app/attachments/tmp/user-1/uploaded-file.pdf",
      targetKey: "app/attachments/reimbursements/request-1/uploaded-file.pdf",
      traceId: "trace-id",
    });

    await asyncTasks[0]?.fn();

    expect(r2ObjectMocks.moveR2Object).toHaveBeenCalledWith({
      mimeType: "application/pdf",
      sourceKey: "app/attachments/tmp/user-1/uploaded-file.pdf",
      targetKey: "app/attachments/reimbursements/request-1/uploaded-file.pdf",
    });
    expect(jobMocks.enqueue).not.toHaveBeenCalled();
  });

  it("requires a move handler for server temp uploads", () => {
    expect(() =>
      claimUploadedR2ObjectKey("app/attachments/tmp/user-1/uploaded-file.pdf", {
        ...baseOptions,
        asyncTasks: [],
        moveR2Object: undefined,
        r2KeyPrefix: "app",
        txLocation: "server",
      })
    ).toThrow("R2 object move handler is required");
  });

  it("marks scheduled message temp moves as blocking", async () => {
    const asyncTasks: AsyncTask[] = [];

    expect(
      claimUploadedR2ObjectKey("app/scheduled-messages/tmp/user-1/media.png", {
        asyncTasks,
        durablePrefix: "message-id",
        mimeType: "image/png",
        moveR2Object: r2ObjectMocks.moveR2Object,
        r2KeyPrefix: "app",
        subfolder: "scheduled-messages",
        txLocation: "server",
        userId: "user-1",
      })
    ).toBe("app/scheduled-messages/message-id/media.png");

    expect(asyncTasks).toHaveLength(1);
    expect(asyncTasks[0]?.blocking).toBe(true);

    await asyncTasks[0]?.fn();

    expect(r2ObjectMocks.moveR2Object).toHaveBeenCalledWith({
      mimeType: "image/png",
      sourceKey: "app/scheduled-messages/tmp/user-1/media.png",
      targetKey: "app/scheduled-messages/message-id/media.png",
    });
    expect(jobMocks.enqueue).not.toHaveBeenCalled();
  });

  it("preserves scheduled media upload ids when claiming duplicate filenames", () => {
    expect(
      claimUploadedR2ObjectKey(
        "app/scheduled-messages/tmp/user-1/upload-1-media.png",
        {
          durablePrefix: "message-id",
          subfolder: "scheduled-messages",
          txLocation: "client",
          userId: "user-1",
        }
      )
    ).toBe("app/scheduled-messages/message-id/upload-1-media.png");

    expect(
      claimUploadedR2ObjectKey(
        "app/scheduled-messages/tmp/user-1/upload-2-media.png",
        {
          durablePrefix: "message-id",
          subfolder: "scheduled-messages",
          txLocation: "client",
          userId: "user-1",
        }
      )
    ).toBe("app/scheduled-messages/message-id/upload-2-media.png");
  });

  it("does not move existing persisted keys during server replacement", () => {
    expect(
      claimUploadedR2ObjectKey("app/attachments/existing/file.pdf", {
        ...baseOptions,
        asyncTasks: [],
        existingObjectKeys: new Set(["app/attachments/existing/file.pdf"]),
        r2KeyPrefix: "app",
        txLocation: "server",
      })
    ).toBe("app/attachments/existing/file.pdf");

    expect(jobMocks.enqueue).not.toHaveBeenCalled();
  });

  it("rejects durable scheduled message keys unless they already exist", () => {
    const asyncTasks: AsyncTask[] = [];

    expect(() =>
      claimUploadedR2ObjectKey("app/scheduled-messages/message-id/media.png", {
        asyncTasks,
        durablePrefix: "message-id",
        mimeType: "image/png",
        r2KeyPrefix: "app",
        subfolder: "scheduled-messages",
        txLocation: "server",
        userId: "user-1",
      })
    ).toThrow("Invalid attachment object key");

    expect(asyncTasks).toEqual([]);
    expect(jobMocks.enqueue).not.toHaveBeenCalled();
  });
});

describe("enqueueDeleteR2Object", () => {
  it("enqueues delete-r2-object only for server tx location", async () => {
    const asyncTasks: AsyncTask[] = [];

    enqueueDeleteR2Object(
      { asyncTasks, enqueue: jobMocks.enqueue, traceId: "trace-id" },
      "server",
      "app/attachments/request/receipt.pdf",
      { mutator: "test.delete", requestId: "request-1" }
    );

    expect(asyncTasks).toHaveLength(1);
    expect(asyncTasks[0]?.meta).toEqual({
      mutator: "test.delete",
      requestId: "request-1",
    });

    await asyncTasks[0]?.fn();
    expect(jobMocks.enqueue).toHaveBeenCalledWith(
      "delete-r2-object",
      { r2Key: "app/attachments/request/receipt.pdf" },
      { traceId: "trace-id" }
    );
  });

  it("does not enqueue delete-r2-object for client tx location", () => {
    const asyncTasks: AsyncTask[] = [];

    enqueueDeleteR2Object(
      { asyncTasks, traceId: "trace-id" },
      "client",
      "app/attachments/request/receipt.pdf",
      { mutator: "test.delete" }
    );

    expect(asyncTasks).toEqual([]);
    expect(jobMocks.enqueue).not.toHaveBeenCalled();
  });
});

describe("relation attachment cleanup callbacks", () => {
  it("invokes onDeleteAttachmentObjectKey when replaceRelations drops an attachment", async () => {
    const deletedObjectKeys: string[] = [];
    const deletedAttachmentIds: string[] = [];

    await replaceRelations(
      { reimbursementId: "request-1" },
      [],
      [],
      "user-1",
      1_700_000_000_000,
      {
        deleteAttachment: async ({ id }) => {
          deletedAttachmentIds.push(id);
          await Promise.resolve();
        },
        deleteLineItem: async () => undefined,
        insertAttachment: async () => undefined,
        insertHistory: async () => undefined,
        insertLineItem: async () => undefined,
        onDeleteAttachmentObjectKey: (key) => deletedObjectKeys.push(key),
        queryAttachments: async () => [
          { id: "att-1", objectKey: "app/attachments/request/receipt.pdf" },
        ],
        queryLineItems: async () => [],
      }
    );

    expect(deletedObjectKeys).toEqual(["app/attachments/request/receipt.pdf"]);
    expect(deletedAttachmentIds).toEqual(["att-1"]);
  });

  it("keeps retained attachment object keys during replaceRelations", async () => {
    const deletedObjectKeys: string[] = [];

    await replaceRelations(
      { reimbursementId: "request-1" },
      [],
      [
        {
          filename: "receipt.pdf",
          id: "att-1",
          mimeType: "application/pdf",
          objectKey: "app/attachments/request/receipt.pdf",
          type: "file",
        },
      ],
      "user-1",
      1_700_000_000_000,
      {
        deleteAttachment: async () => undefined,
        deleteLineItem: async () => undefined,
        insertAttachment: async () => undefined,
        insertHistory: async () => undefined,
        insertLineItem: async () => undefined,
        onDeleteAttachmentObjectKey: (key) => deletedObjectKeys.push(key),
        queryAttachments: async () => [
          { id: "att-1", objectKey: "app/attachments/request/receipt.pdf" },
        ],
        queryLineItems: async () => [],
      },
      {
        durablePrefix: "reimbursements/request-1",
        subfolder: "attachments",
        txLocation: "client",
        userId: "user-1",
      }
    );

    expect(deletedObjectKeys).toEqual([]);
  });

  it("invokes onDeleteAttachmentObjectKey for deleteAllRelations attachments", async () => {
    const deletedObjectKeys: string[] = [];
    const deletedAttachmentIds: string[] = [];

    await deleteAllRelations({
      deleteAttachment: async ({ id }) => {
        deletedAttachmentIds.push(id);
        await Promise.resolve();
      },
      deleteHistory: async () => undefined,
      deleteLineItem: async () => undefined,
      onDeleteAttachmentObjectKey: (key) => deletedObjectKeys.push(key),
      queryAttachments: async () => [
        { id: "att-1", objectKey: "app/attachments/request/receipt.pdf" },
        { id: "att-2", objectKey: null },
      ],
      queryHistory: async () => [],
      queryLineItems: async () => [],
    });

    expect(deletedObjectKeys).toEqual(["app/attachments/request/receipt.pdf"]);
    expect(deletedAttachmentIds).toEqual(["att-1", "att-2"]);
  });
});
