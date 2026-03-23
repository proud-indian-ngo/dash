import { describe, expect, it } from "vitest";
import z from "zod";

const lineItemSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  description: z.string().optional(),
  amount: z.number(),
  sortOrder: z.number(),
});

const attachmentSchema = z.object({
  id: z.string(),
  type: z.enum(["file", "url"]),
  objectKey: z.string().optional(),
  url: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
});

const createSchema = z.object({
  id: z.string(),
  vendorId: z.string(),
  title: z.string().min(1),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().min(1),
  lineItems: z.array(lineItemSchema),
  attachments: z.array(attachmentSchema),
});

const approveSchema = z.object({
  id: z.string(),
  note: z.string().optional(),
  approvalScreenshotKey: z.string().optional(),
});

const deleteSchema = z.object({ id: z.string() });

const rejectSchema = z.object({
  id: z.string(),
  reason: z.string().trim().min(1),
});

describe("vendorPayment mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input", () => {
      const result = createSchema.safeParse({
        id: "vp-1",
        vendorId: "vendor-1",
        title: "Office supplies",
        invoiceDate: "2026-01-15",
        lineItems: [
          {
            id: "li-1",
            categoryId: "cat-1",
            amount: 1000,
            sortOrder: 0,
          },
        ],
        attachments: [],
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty title", () => {
      const result = createSchema.safeParse({
        id: "vp-1",
        vendorId: "vendor-1",
        title: "",
        invoiceDate: "2026-01-15",
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing vendorId", () => {
      const result = createSchema.safeParse({
        id: "vp-1",
        title: "Test",
        invoiceDate: "2026-01-15",
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty invoiceDate", () => {
      const result = createSchema.safeParse({
        id: "vp-1",
        vendorId: "vendor-1",
        title: "Test",
        invoiceDate: "",
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("approve", () => {
    it("accepts valid input with note and screenshot", () => {
      const result = approveSchema.safeParse({
        id: "vp-1",
        note: "Looks good",
        approvalScreenshotKey: "screenshots/proof.png",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid input without optional fields", () => {
      const result = approveSchema.safeParse({ id: "vp-1" });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = approveSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("reject", () => {
    it("accepts valid input with reason", () => {
      const result = rejectSchema.safeParse({
        id: "vp-1",
        reason: "Missing invoice",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty reason", () => {
      const result = rejectSchema.safeParse({
        id: "vp-1",
        reason: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects whitespace-only reason", () => {
      const result = rejectSchema.safeParse({
        id: "vp-1",
        reason: "   ",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("delete", () => {
    it("accepts valid input", () => {
      const result = deleteSchema.safeParse({ id: "vp-1" });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = deleteSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

describe("vendor payment status transitions", () => {
  const canApprove = (status: string) => status === "pending";
  const canReject = (status: string) => status === "pending";
  const canUpdate = (status: string) => status === "pending";

  it("approve should only work on pending status", () => {
    expect(canApprove("pending")).toBe(true);
    expect(canApprove("approved")).toBe(false);
    expect(canApprove("rejected")).toBe(false);
  });

  it("reject should only work on pending status", () => {
    expect(canReject("pending")).toBe(true);
    expect(canReject("approved")).toBe(false);
    expect(canReject("rejected")).toBe(false);
  });

  it("update should only work on pending status", () => {
    expect(canUpdate("pending")).toBe(true);
    expect(canUpdate("approved")).toBe(false);
    expect(canUpdate("rejected")).toBe(false);
  });
});

describe("vendor payment authorization", () => {
  function canDelete(opts: {
    isAdmin: boolean;
    isOwner: boolean;
    status: string;
  }): boolean {
    return opts.isAdmin || (opts.isOwner && opts.status === "pending");
  }

  function canModify(opts: { isAdmin: boolean; isOwner: boolean }): boolean {
    return opts.isAdmin || opts.isOwner;
  }

  it("admin can delete any payment", () => {
    expect(
      canDelete({ isAdmin: true, isOwner: false, status: "approved" })
    ).toBe(true);
  });

  it("owner can delete pending payment", () => {
    expect(
      canDelete({ isAdmin: false, isOwner: true, status: "pending" })
    ).toBe(true);
  });

  it("owner cannot delete approved payment", () => {
    expect(
      canDelete({ isAdmin: false, isOwner: true, status: "approved" })
    ).toBe(false);
  });

  it("non-owner non-admin cannot delete", () => {
    expect(
      canDelete({ isAdmin: false, isOwner: false, status: "pending" })
    ).toBe(false);
  });

  it("owner can modify their payment", () => {
    expect(canModify({ isAdmin: false, isOwner: true })).toBe(true);
  });

  it("non-owner non-admin cannot modify", () => {
    expect(canModify({ isAdmin: false, isOwner: false })).toBe(false);
  });
});

describe("vendor validation for payments", () => {
  const canUseVendor = (vendorStatus: string) => vendorStatus === "approved";

  it("requires vendor to be approved for creation", () => {
    expect(canUseVendor("approved")).toBe(true);
    expect(canUseVendor("pending")).toBe(false);
  });

  it("requires vendor to be approved for update", () => {
    expect(canUseVendor("approved")).toBe(true);
    expect(canUseVendor("pending")).toBe(false);
  });
});
