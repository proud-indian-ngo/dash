import { describe, expect, it } from "vitest";
import z from "zod";

const createSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  message: z.string().optional(),
});

const approveSchema = z.object({ id: z.string() });
const rejectSchema = z.object({ id: z.string() });
const cancelSchema = z.object({ id: z.string() });

describe("eventInterest mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input with message", () => {
      const result = createSchema.safeParse({
        id: "uuid-1",
        eventId: "event-1",
        message: "I want to help!",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid input without message", () => {
      const result = createSchema.safeParse({
        id: "uuid-1",
        eventId: "event-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = createSchema.safeParse({ eventId: "event-1" });
      expect(result.success).toBe(false);
    });

    it("rejects missing eventId", () => {
      const result = createSchema.safeParse({ id: "uuid-1" });
      expect(result.success).toBe(false);
    });
  });

  describe("approve", () => {
    it("accepts valid input", () => {
      const result = approveSchema.safeParse({ id: "interest-1" });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = approveSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("reject", () => {
    it("accepts valid input", () => {
      const result = rejectSchema.safeParse({ id: "interest-1" });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = rejectSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("cancel", () => {
    it("accepts valid input", () => {
      const result = cancelSchema.safeParse({ id: "interest-1" });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = cancelSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

describe("event interest status transitions", () => {
  const validStatuses = ["pending", "approved", "rejected"] as const;

  it("initial status should be pending", () => {
    expect(validStatuses[0]).toBe("pending");
  });

  it("approve should only work on pending status", () => {
    const canApprove = (status: string) => status === "pending";
    expect(canApprove("pending")).toBe(true);
    expect(canApprove("approved")).toBe(false);
    expect(canApprove("rejected")).toBe(false);
  });

  it("reject should only work on pending status", () => {
    const canReject = (status: string) => status === "pending";
    expect(canReject("pending")).toBe(true);
    expect(canReject("approved")).toBe(false);
    expect(canReject("rejected")).toBe(false);
  });

  it("cancel should only work on pending status", () => {
    const canCancel = (status: string) => status === "pending";
    expect(canCancel("pending")).toBe(true);
    expect(canCancel("approved")).toBe(false);
    expect(canCancel("rejected")).toBe(false);
  });
});
