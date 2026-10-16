import { describe, expect, it } from "bun:test";

import {
  bankAccountSchema,
  createBankAccountSchema,
  IFSC_PATTERN,
} from "./banking-schema";

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
    upiId: "",
  };
  const pathsOf = (value: typeof valid, schema = bankAccountSchema) => {
    const result = schema.safeParse(value);
    return result.success
      ? []
      : result.error.issues.map((issue) => issue.path.join("."));
  };

  it("accepts bank details alone", () => {
    expect(pathsOf(valid)).toEqual([]);
  });

  it("accepts lowercase IFSC", () => {
    expect(pathsOf({ ...valid, ifscCode: "sbin0001234" })).toEqual([]);
  });

  it("accepts UPI alone", () => {
    expect(
      pathsOf({ ...valid, accountNumber: "", ifscCode: "", upiId: "john@ybl" })
    ).toEqual([]);
  });

  it("accepts bank details and UPI together", () => {
    expect(pathsOf({ ...valid, upiId: "+91 98765 43210" })).toEqual([]);
  });

  it("rejects an empty name", () => {
    expect(pathsOf({ ...valid, accountName: "" })).toEqual(["accountName"]);
  });

  it("rejects an entry with neither bank details nor UPI", () => {
    expect(
      pathsOf({ ...valid, accountNumber: "", ifscCode: "", upiId: "" })
    ).toEqual(["accountNumber"]);
  });

  it("rejects an invalid IFSC", () => {
    expect(pathsOf({ ...valid, ifscCode: "INVALID" })).toEqual(["ifscCode"]);
  });

  it("rejects a UPI value that is neither an ID nor a number", () => {
    expect(pathsOf({ ...valid, upiId: "not upi" })).toEqual(["upiId"]);
  });

  it("refuses a number or UPI ID already saved", () => {
    const schema = createBankAccountSchema([
      { accountNumber: "1234567890", upiId: "john@ybl" },
    ]);
    expect(pathsOf(valid, schema)).toEqual(["accountNumber"]);
    expect(
      pathsOf(
        { ...valid, accountNumber: "", ifscCode: "", upiId: "JOHN@YBL" },
        schema
      )
    ).toEqual(["upiId"]);
  });
});
