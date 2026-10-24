import { describe, expect, it } from "bun:test";

import { needsIdNumber, saveDonorSchema } from "./donor-schema";

const base = {
  addressLine1: "",
  addressLine2: "",
  assessmentNote: "",
  city: "",
  country: "in",
  displayName: "Asha Rao",
  email: "",
  expectedPartyUpdatedAt: null,
  expectedUpdatedAt: null,
  foreignSourceAssessment: "domestic" as const,
  id: "01930000-0000-7000-8000-000000000501",
  idNumber: "",
  idType: "none" as const,
  kind: "person" as const,
  legalName: "",
  mode: "create" as const,
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

  it("needs an identifier unless none or a kept stored one", () => {
    expect(needsIdNumber({ idNumber: "", idType: "none" }, null)).toBe(false);
    expect(needsIdNumber({ idNumber: "", idType: "pan" }, null)).toBe(true);
    expect(needsIdNumber({ idNumber: "X", idType: "pan" }, null)).toBe(false);
    expect(
      needsIdNumber(
        { idNumber: "", idType: "pan" },
        { hasIdNumber: true, idType: "pan" }
      )
    ).toBe(false);
    expect(
      needsIdNumber(
        { idNumber: "", idType: "passport" },
        { hasIdNumber: true, idType: "pan" }
      )
    ).toBe(true);
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

  it.each(["=1+1", "+1+1", "-1+1", "@SUM(A1)", "\t=1+1", "\r=1+1"])(
    "rejects formula-leading filing text in %j",
    (value) => {
      expect(
        saveDonorSchema.safeParse({ ...base, displayName: value }).success
      ).toBe(false);
      expect(
        saveDonorSchema.safeParse({ ...base, addressLine1: value }).success
      ).toBe(false);
      expect(saveDonorSchema.safeParse(base).success).toBe(true);
    }
  );
});
