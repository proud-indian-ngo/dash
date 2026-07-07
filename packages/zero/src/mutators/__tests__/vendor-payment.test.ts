import { describe, expect, it } from "vitest";
import z from "zod";
import { assertVendorUsable } from "../submission-helpers";

const lineItemSchema = z.object({
  amount: z.number(),
  categoryId: z.string(),
  description: z.string().optional(),
  id: z.string(),
  sortOrder: z.number(),
});

const attachmentSchema = z.object({
  filename: z.string().optional(),
  id: z.string(),
  mimeType: z.string().optional(),
  objectKey: z.string().optional(),
  type: z.enum(["file", "url"]),
  url: z.string().optional(),
});

const createSchema = z.object({
  attachments: z.array(attachmentSchema),
  id: z.string(),
  invoiceDate: z.number(),
  invoiceNumber: z.string().optional(),
  lineItems: z.array(lineItemSchema),
  title: z.string().min(1),
  vendorId: z.string(),
});

const approveSchema = z.object({
  approvalScreenshotKey: z.string().optional(),
  id: z.string(),
  note: z.string().optional(),
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
        attachments: [],
        id: "vp-1",
        invoiceDate: new Date("2026-01-15").getTime(),
        lineItems: [
          {
            amount: 1000,
            categoryId: "cat-1",
            id: "li-1",
            sortOrder: 0,
          },
        ],
        title: "Office supplies",
        vendorId: "vendor-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty title", () => {
      const result = createSchema.safeParse({
        attachments: [],
        id: "vp-1",
        invoiceDate: new Date("2026-01-15").getTime(),
        lineItems: [],
        title: "",
        vendorId: "vendor-1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing vendorId", () => {
      const result = createSchema.safeParse({
        attachments: [],
        id: "vp-1",
        invoiceDate: new Date("2026-01-15").getTime(),
        lineItems: [],
        title: "Test",
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-number invoiceDate", () => {
      const result = createSchema.safeParse({
        attachments: [],
        id: "vp-1",
        invoiceDate: "2026-01-15",
        lineItems: [],
        title: "Test",
        vendorId: "vendor-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("approve", () => {
    it("accepts valid input with note and screenshot", () => {
      const result = approveSchema.safeParse({
        approvalScreenshotKey: "screenshots/proof.png",
        id: "vp-1",
        note: "Looks good",
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

describe("vendor validation for payments (assertVendorUsable)", () => {
  it("allows approved vendor for any user", () => {
    expect(() =>
      assertVendorUsable(
        { createdBy: "other-user", status: "approved" },
        "user-1"
      )
    ).not.toThrow();
  });

  it("allows pending vendor created by the same user", () => {
    expect(() =>
      assertVendorUsable({ createdBy: "user-1", status: "pending" }, "user-1")
    ).not.toThrow();
  });

  it("blocks rejected vendor even if created by the same user", () => {
    expect(() =>
      assertVendorUsable(
        { createdBy: "user-1", status: "rejected" as "approved" },
        "user-1"
      )
    ).toThrow("Vendor is not available");
  });

  it("blocks pending vendor created by another user", () => {
    expect(() =>
      assertVendorUsable(
        { createdBy: "other-user", status: "pending" },
        "user-1"
      )
    ).toThrow("Vendor is not available");
  });

  it("allows pending vendor created by another user when bypass is enabled", () => {
    expect(() =>
      assertVendorUsable(
        { createdBy: "other-user", status: "pending" },
        "user-1",
        true
      )
    ).not.toThrow();
  });
});
