import { describe, expect, it } from "bun:test";

import { saveVendorSchema } from "./vendor-schema";

const base = {
  address: "",
  bankAccountIfscCode: "sbin0001234",
  bankAccountName: "Acme Supplies",
  bankAccountNumber: "1234567890",
  contactEmail: "",
  contactPhone: "+919876543210",
  expectedPartyUpdatedAt: null,
  expectedUpdatedAt: null,
  gstNumber: "",
  id: "019d52c3-0000-7000-8000-000000000001",
  mode: "create" as const,
  name: "Acme",
  panNumber: "",
};

describe("saveVendorSchema", () => {
  it("accepts a new vendor and uppercases the IFSC", () => {
    const parsed = saveVendorSchema.parse(base);
    expect(parsed.bankAccountIfscCode).toBe("SBIN0001234");
  });

  it("requires an account number on create", () => {
    const result = saveVendorSchema.safeParse({
      ...base,
      bankAccountNumber: "",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["bankAccountNumber"]);
  });

  it("lets an update keep the stored account and PAN by leaving them blank", () => {
    const result = saveVendorSchema.safeParse({
      ...base,
      bankAccountNumber: "",
      expectedPartyUpdatedAt: 1,
      mode: "update",
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed tax IDs and phones", () => {
    expect(
      saveVendorSchema.safeParse({ ...base, panNumber: "ABC" }).success
    ).toBe(false);
    expect(
      saveVendorSchema.safeParse({ ...base, gstNumber: "22AAA" }).success
    ).toBe(false);
    expect(
      saveVendorSchema.safeParse({ ...base, contactPhone: "123" }).success
    ).toBe(false);
  });

  it("accepts fixture IDs without a version digit", () => {
    expect(
      saveVendorSchema.safeParse({
        ...base,
        id: "e2e00000-0000-0000-0000-000000000003",
      }).success
    ).toBe(true);
  });
});
