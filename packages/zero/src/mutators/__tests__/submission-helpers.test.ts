import { describe, expect, it } from "vitest";
import {
  assertCanDelete,
  assertCanModify,
  assertEntityExists,
  assertPending,
  buildAttachmentInsert,
  buildHistoryInsert,
  buildLineItemInsert,
} from "../submission-helpers";

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
});

describe("assertCanModify", () => {
  it("passes for owner with pending status", () => {
    expect(() =>
      assertCanModify(
        { userId: "user-1", status: "pending" },
        "user-1",
        false,
        "reimbursement"
      )
    ).not.toThrow();
  });

  it("passes for admin with pending status", () => {
    expect(() =>
      assertCanModify(
        { userId: "user-1", status: "pending" },
        "admin-1",
        true,
        "reimbursement"
      )
    ).not.toThrow();
  });

  it("throws unauthorized when not owner and not admin", () => {
    expect(() =>
      assertCanModify(
        { userId: "user-1", status: "pending" },
        "user-2",
        false,
        "reimbursement"
      )
    ).toThrow("Unauthorized");
  });

  it("throws when not pending even if owner", () => {
    expect(() =>
      assertCanModify(
        { userId: "user-1", status: "approved" },
        "user-1",
        false,
        "reimbursement"
      )
    ).toThrow("Only pending reimbursements can be updated");
  });

  it("throws when not pending even if admin", () => {
    expect(() =>
      assertCanModify(
        { userId: "user-1", status: "approved" },
        "admin-1",
        true,
        "reimbursement"
      )
    ).toThrow("Only pending reimbursements can be updated");
  });
});

describe("assertCanDelete", () => {
  it("passes for admin regardless of status", () => {
    expect(() =>
      assertCanDelete({ userId: "user-1", status: "approved" }, "admin-1", true)
    ).not.toThrow();
  });

  it("passes for owner with pending status", () => {
    expect(() =>
      assertCanDelete({ userId: "user-1", status: "pending" }, "user-1", false)
    ).not.toThrow();
  });

  it("throws for owner with non-pending status", () => {
    expect(() =>
      assertCanDelete({ userId: "user-1", status: "approved" }, "user-1", false)
    ).toThrow("Unauthorized");
  });

  it("throws for non-owner non-admin", () => {
    expect(() =>
      assertCanDelete({ userId: "user-1", status: "pending" }, "user-2", false)
    ).toThrow("Unauthorized");
  });
});

describe("buildLineItemInsert", () => {
  it("returns correct shape", () => {
    const now = 1_700_000_000_000;
    const result = buildLineItemInsert(
      {
        id: "li-1",
        categoryId: "cat-1",
        description: "Test item",
        amount: 500,
        sortOrder: 0,
      },
      now
    );
    expect(result).toEqual({
      id: "li-1",
      categoryId: "cat-1",
      description: "Test item",
      amount: 500,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
  });
});

describe("buildAttachmentInsert", () => {
  it("returns correct shape for file type", () => {
    const now = 1_700_000_000_000;
    const result = buildAttachmentInsert(
      {
        id: "att-1",
        type: "file",
        objectKey: "uploads/file.pdf",
        filename: "file.pdf",
        mimeType: "application/pdf",
      },
      now
    );
    expect(result).toEqual({
      id: "att-1",
      type: "file",
      filename: "file.pdf",
      objectKey: "uploads/file.pdf",
      url: null,
      mimeType: "application/pdf",
      createdAt: now,
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
      id: "att-2",
      type: "url",
      filename: null,
      objectKey: null,
      url: "https://example.com/doc",
      mimeType: null,
      createdAt: now,
    });
  });
});

describe("buildHistoryInsert", () => {
  it("returns correct shape with note", () => {
    const now = 1_700_000_000_000;
    const result = buildHistoryInsert("actor-1", "approved", now, "Looks good");
    expect(result).toMatchObject({
      actorId: "actor-1",
      action: "approved",
      note: "Looks good",
      metadata: null,
      createdAt: now,
    });
    expect(result.id).toBeDefined();
  });

  it("returns null note when omitted", () => {
    const now = 1_700_000_000_000;
    const result = buildHistoryInsert("actor-1", "created", now);
    expect(result.note).toBeNull();
  });
});
