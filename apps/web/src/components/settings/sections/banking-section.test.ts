import { describe, expect, it } from "vitest";
import { bankAccountSchema, IFSC_PATTERN } from "./banking-schema";

describe("IFSC_PATTERN", () => {
  it("matches valid IFSC codes", () => {
    expect(IFSC_PATTERN.test("SBIN0001234")).toBe(true);
    expect(IFSC_PATTERN.test("HDFC0BRANCH")).toBe(true);
    expect(IFSC_PATTERN.test("ICIC0000001")).toBe(true);
    expect(IFSC_PATTERN.test("ABCD0ABCDEF")).toBe(true);
  });

  it("rejects IFSC without zero at 5th position", () => {
    expect(IFSC_PATTERN.test("SBIN1001234")).toBe(false);
  });

  it("rejects too short", () => {
    expect(IFSC_PATTERN.test("SBIN012")).toBe(false);
  });

  it("rejects too long", () => {
    expect(IFSC_PATTERN.test("SBIN00012345")).toBe(false);
  });

  it("rejects lowercase", () => {
    expect(IFSC_PATTERN.test("sbin0001234")).toBe(false);
  });

  it("rejects digits in first 4 chars", () => {
    expect(IFSC_PATTERN.test("1BIN0001234")).toBe(false);
  });
});

describe("bankAccountSchema", () => {
  const valid = {
    accountName: "John Doe",
    accountNumber: "1234567890",
    ifscCode: "SBIN0001234",
  };

  it("accepts valid input", () => {
    const result = bankAccountSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects empty accountName", () => {
    const result = bankAccountSchema.safeParse({
      ...valid,
      accountName: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Account name is required");
    }
  });

  it("rejects empty accountNumber", () => {
    const result = bankAccountSchema.safeParse({
      ...valid,
      accountNumber: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Account number is required"
      );
    }
  });

  it("rejects invalid IFSC code", () => {
    const result = bankAccountSchema.safeParse({
      ...valid,
      ifscCode: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("accepts lowercase IFSC (refine uppercases)", () => {
    // The schema uses .refine with toUpperCase(), so lowercase should pass
    const result = bankAccountSchema.safeParse({
      ...valid,
      ifscCode: "sbin0001234",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing fields", () => {
    const result = bankAccountSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
