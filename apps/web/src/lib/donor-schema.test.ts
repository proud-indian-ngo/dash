import { describe, expect, it } from "bun:test";

import { saveDonorSchema } from "./donor-schema";

const base = {
  addressLine1: "",
  addressLine2: "",
  assessmentNote: "",
  city: "",
  country: "in",
  displayName: "Asha Rao",
  email: "",
  foreignSourceAssessment: "domestic" as const,
  idNumber: "",
  idType: "none" as const,
  kind: "person" as const,
  legalName: "",
  nationality: "",
  phone: "",
  pincode: "",
  roles: ["donor" as const],
  state: "",
};

describe("saveDonorSchema", () => {
  it("normalises country and identifiers to upper case", () => {
    const parsed = saveDonorSchema.parse({
      ...base,
      idNumber: "abcde1234f",
      idType: "pan",
    });
    expect(parsed.country).toBe("IN");
    expect(parsed.idNumber).toBe("ABCDE1234F");
  });

  it("validates PAN format only when the type is PAN", () => {
    expect(
      saveDonorSchema.safeParse({ ...base, idNumber: "nope", idType: "pan" })
        .success
    ).toBe(false);
    expect(
      saveDonorSchema.safeParse({
        ...base,
        idNumber: "nope",
        idType: "passport",
      }).success
    ).toBe(true);
    expect(saveDonorSchema.safeParse({ ...base, idType: "pan" }).success).toBe(
      true
    );
  });

  it("requires a role, a valid phone and a two-letter country", () => {
    expect(saveDonorSchema.safeParse({ ...base, roles: [] }).success).toBe(
      false
    );
    expect(saveDonorSchema.safeParse({ ...base, phone: "12345" }).success).toBe(
      false
    );
    expect(
      saveDonorSchema.safeParse({ ...base, phone: "+919876543210" }).success
    ).toBe(true);
    expect(saveDonorSchema.safeParse({ ...base, country: "ind" }).success).toBe(
      false
    );
    expect(
      saveDonorSchema.safeParse({ ...base, roles: ["vendor"] }).success
    ).toBe(false);
  });
});
