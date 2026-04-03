import { describe, expect, it } from "vitest";
import { deriveMessageStatus } from "./scheduled-message";

describe("deriveMessageStatus", () => {
  it("returns 'pending' for empty recipients", () => {
    expect(deriveMessageStatus([])).toBe("pending");
  });

  it("returns 'pending' when all recipients are pending", () => {
    expect(
      deriveMessageStatus([{ status: "pending" }, { status: "pending" }])
    ).toBe("pending");
  });

  it("returns 'sent' when all recipients are sent", () => {
    expect(deriveMessageStatus([{ status: "sent" }, { status: "sent" }])).toBe(
      "sent"
    );
  });

  it("returns 'failed' when all recipients are failed", () => {
    expect(
      deriveMessageStatus([{ status: "failed" }, { status: "failed" }])
    ).toBe("failed");
  });

  it("returns 'cancelled' when all recipients are cancelled", () => {
    expect(
      deriveMessageStatus([{ status: "cancelled" }, { status: "cancelled" }])
    ).toBe("cancelled");
  });

  it("returns 'partial' for mixed sent+failed", () => {
    expect(
      deriveMessageStatus([{ status: "sent" }, { status: "failed" }])
    ).toBe("partial");
  });

  it("returns 'partial' for mixed pending+failed", () => {
    expect(
      deriveMessageStatus([{ status: "pending" }, { status: "failed" }])
    ).toBe("partial");
  });

  it("returns 'pending' for mixed pending+sent", () => {
    expect(
      deriveMessageStatus([{ status: "pending" }, { status: "sent" }])
    ).toBe("pending");
  });

  it("returns 'partial' for mixed sent+failed+pending", () => {
    expect(
      deriveMessageStatus([
        { status: "sent" },
        { status: "failed" },
        { status: "pending" },
      ])
    ).toBe("partial");
  });

  it("handles single recipient per status", () => {
    expect(deriveMessageStatus([{ status: "sent" }])).toBe("sent");
    expect(deriveMessageStatus([{ status: "failed" }])).toBe("failed");
    expect(deriveMessageStatus([{ status: "cancelled" }])).toBe("cancelled");
    expect(deriveMessageStatus([{ status: "pending" }])).toBe("pending");
  });
});
