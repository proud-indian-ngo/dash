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
