import { describe, expect, it } from "vitest";

import {
  buildFillSave,
  type ExistingFillRow,
  fillValuesPresent,
  PartyConflictError,
  partyDetailGaps,
  resolveAssessedOn,
  resolveBankAccount,
  resolveSaveMode,
  resolveSecret,
} from "./party-save-rules";

const t0 = new Date("2026-10-13T06:00:00Z");
const t1 = new Date("2026-10-13T07:00:00Z");
const actor = "user-1";
const partyRow = (
  overrides: Partial<{ createdBy: string | null; updatedAt: Date }> = {}
) => ({
  createdAt: t0,
  createdBy: actor,
  updatedAt: t0,
  ...overrides,
});
const privateRow = (updatedAt = t0) => ({ updatedAt });
const update = (
  expectedUpdatedAt: number | null,
  expectedPartyUpdatedAt: number | null
) => ({
  actorId: actor,
  expectedPartyUpdatedAt,
  expectedUpdatedAt,
  mode: "update" as const,
});
const create = {
  actorId: actor,
  expectedPartyUpdatedAt: null,
  expectedUpdatedAt: null,
  mode: "create" as const,
};

describe("resolveSaveMode", () => {
  it("creates when nothing exists", () => {
    expect(resolveSaveMode(create, null, null)).toEqual({ kind: "create" });
  });

  it("treats an identical completed create by the same actor as a retry", () => {
    expect(resolveSaveMode(create, partyRow(), privateRow())).toEqual({
      kind: "retry",
    });
    expect(resolveSaveMode(create, partyRow(), null)).toEqual({
      kind: "retry",
    });
  });

  it("refuses a create that reuses another donor's ID", () => {
    expect(() =>
      resolveSaveMode(
        create,
        partyRow({ createdBy: "someone-else" }),
        privateRow()
      )
    ).toThrow(PartyConflictError);
    expect(() =>
      resolveSaveMode(create, partyRow({ updatedAt: t1 }), privateRow())
    ).toThrow(PartyConflictError);
    expect(() => resolveSaveMode(create, partyRow(), privateRow(t1))).toThrow(
      PartyConflictError
    );
  });

  it("never treats a system save as a retry, even of an untouched system-created party", () => {
    const systemCreate = { ...create, actorId: null };
    // A system import always mints a fresh uuidv7, so it creates.
    expect(resolveSaveMode(systemCreate, null, null)).toEqual({
      kind: "create",
    });
    // Should an ID ever collide, an unrelated party is refused, not reused.
    expect(() =>
      resolveSaveMode(systemCreate, partyRow({ createdBy: null }), privateRow())
    ).toThrow(PartyConflictError);
    expect(() =>
      resolveSaveMode(systemCreate, partyRow({ createdBy: null }), null)
    ).toThrow(PartyConflictError);
  });

  it("rejects an update of a missing party", () => {
    expect(() => resolveSaveMode(update(null, null), null, null)).toThrow(
      "Party not found"
    );
  });

  it("updates when both rows match what the editor loaded", () => {
    expect(
      resolveSaveMode(
        update(t0.getTime(), t0.getTime()),
        partyRow(),
        privateRow()
      )
    ).toEqual({ kind: "update" });
    expect(
      resolveSaveMode(update(null, t0.getTime()), partyRow(), null)
    ).toEqual({ kind: "update" });
  });

  it("rejects a stale private row, a stale party row, or a row the editor never saw", () => {
    expect(() =>
      resolveSaveMode(
        update(t0.getTime(), t0.getTime()),
        partyRow(),
        privateRow(t1)
      )
    ).toThrow(PartyConflictError);
    expect(() =>
      resolveSaveMode(
        update(t0.getTime(), t0.getTime()),
        partyRow({ updatedAt: t1 }),
        privateRow()
      )
    ).toThrow(PartyConflictError);
    expect(() =>
      resolveSaveMode(update(null, t0.getTime()), partyRow(), privateRow())
    ).toThrow(PartyConflictError);
    expect(() =>
      resolveSaveMode(update(t0.getTime(), t0.getTime()), partyRow(), null)
    ).toThrow(PartyConflictError);
  });
});

const encrypt = (plain: string) => ({
  encrypted: `enc(${plain})`,
  last4: plain.slice(-4),
});
const storedPan = {
  idNumberEncrypted: "enc(ABCDE1234F)",
  idNumberLast4: "234F",
  idType: "pan" as const,
};

describe("resolveSecret", () => {
  it("clears a stored identifier and reports it", () => {
    expect(
      resolveSecret({ idNumber: "", idType: "none" }, storedPan, encrypt)
    ).toEqual({
      cleared: true,
      idNumberEncrypted: null,
      idNumberLast4: null,
    });
    expect(
      resolveSecret({ idNumber: "", idType: "none" }, null, encrypt).cleared
    ).toBe(false);
    expect(
      resolveSecret(
        { idNumber: "", idType: "none" },
        {
          ...storedPan,
          idNumberEncrypted: null,
          idNumberLast4: null,
          idType: "none",
        },
        encrypt
      ).cleared
    ).toBe(false);
  });

  it("replaces with a new value, upper-cased", () => {
    expect(
      resolveSecret(
        { idNumber: " abcde1234f ", idType: "pan" },
        storedPan,
        encrypt
      )
    ).toEqual({
      cleared: false,
      idNumberEncrypted: "enc(ABCDE1234F)",
      idNumberLast4: "234F",
    });
  });

  it("keeps a stored identifier of the same type when left blank", () => {
    expect(
      resolveSecret({ idNumber: "", idType: "pan" }, storedPan, encrypt)
    ).toEqual({
      cleared: false,
      idNumberEncrypted: storedPan.idNumberEncrypted,
      idNumberLast4: storedPan.idNumberLast4,
    });
  });

  it("refuses a type change without a number", () => {
    expect(() =>
      resolveSecret({ idNumber: "", idType: "passport" }, storedPan, encrypt)
    ).toThrow("Enter the identifier or set the ID type to none");
    expect(() =>
      resolveSecret({ idNumber: "", idType: "pan" }, null, encrypt)
    ).toThrow("Enter the identifier or set the ID type to none");
  });
});

describe("resolveAssessedOn", () => {
  const today = "2026-10-13";
  it("carries no date while pending", () => {
    expect(resolveAssessedOn("pending", null, today)).toBeNull();
    expect(
      resolveAssessedOn(
        "pending",
        { assessedOn: "2026-01-01", foreignSourceAssessment: "domestic" },
        today
      )
    ).toBeNull();
  });

  it("dates a new or changed decision today", () => {
    expect(resolveAssessedOn("domestic", null, today)).toBe(today);
    expect(
      resolveAssessedOn(
        "foreign",
        { assessedOn: "2026-01-01", foreignSourceAssessment: "domestic" },
        today
      )
    ).toBe(today);
  });

  it("keeps the date of an unchanged decision and fills a missing one", () => {
    expect(
      resolveAssessedOn(
        "domestic",
        { assessedOn: "2026-01-01", foreignSourceAssessment: "domestic" },
        today
      )
    ).toBe("2026-01-01");
    expect(
      resolveAssessedOn(
        "domestic",
        { assessedOn: null, foreignSourceAssessment: "domestic" },
        today
      )
    ).toBe(today);
  });
});

describe("resolveSaveMode noun", () => {
  it("names the record in conflict messages", () => {
    expect(() =>
      resolveSaveMode(
        create,
        partyRow({ createdBy: "someone-else" }),
        null,
        "vendor"
      )
    ).toThrow("A vendor with this ID already exists");
    expect(() =>
      resolveSaveMode(
        update(null, t0.getTime()),
        partyRow(),
        privateRow(),
        "vendor"
      )
    ).toThrow("Someone else changed this vendor");
  });
});

describe("resolveBankAccount", () => {
  it("replaces with a given number, trimmed", () => {
    expect(resolveBankAccount(" 1234567890 ", { id: "a1" })).toEqual({
      accountNumber: "1234567890",
      kind: "replace",
    });
  });

  it("keeps the active account when the number is blank", () => {
    expect(resolveBankAccount("", { id: "a1" })).toEqual({
      accountId: "a1",
      kind: "keep",
    });
  });

  it("asks for a number when there is nothing to keep", () => {
    expect(() => resolveBankAccount("", null)).toThrow(
      "Enter the account number"
    );
    expect(() => resolveBankAccount("  ", null)).toThrow(
      "Enter the account number"
    );
  });
});

describe("partyDetailGaps", () => {
  const empty = {
    addressLine1: null,
    addressLine2: null,
    city: null,
    email: null,
    idNumberEncrypted: null,
    phone: null,
    pincode: null,
    state: null,
  };

  it("treats a donor without private details as lacking everything", () => {
    expect(partyDetailGaps(null)).toEqual({
      address: true,
      email: true,
      idNumber: true,
      phone: true,
    });
  });

  it("treats whitespace as no value", () => {
    expect(
      partyDetailGaps({ ...empty, city: "  ", email: " ", phone: "\t" })
    ).toEqual({ address: true, email: true, idNumber: true, phone: true });
  });

  it("counts any address line as an address, so lines are never mixed", () => {
    expect(partyDetailGaps({ ...empty, city: "Pune" }).address).toBe(false);
    expect(
      partyDetailGaps({ ...empty, email: "a@example.com", phone: "+91" })
    ).toEqual({ address: true, email: false, idNumber: true, phone: false });
    expect(
      partyDetailGaps({ ...empty, idNumberEncrypted: "v1:x" }).idNumber
    ).toBe(false);
  });
});

describe("fillValuesPresent", () => {
  const values = {
    addressLine1: "",
    addressLine2: "",
    city: "",
    email: "a@example.com",
    idNumber: "ABCDE1234F",
    idType: "pan" as const,
    phone: "",
    pincode: "560001",
    state: "",
  };

  it("offers an ID number only when identifiers can be stored", () => {
    expect(fillValuesPresent(values, { canStoreIds: true })).toEqual({
      address: true,
      email: true,
      idNumber: true,
      phone: false,
    });
    expect(fillValuesPresent(values, { canStoreIds: false }).idNumber).toBe(
      false
    );
    expect(
      fillValuesPresent(
        { ...values, idNumber: "", idType: "none" },
        { canStoreIds: true }
      ).idNumber
    ).toBe(false);
  });
});

describe("buildFillSave", () => {
  const partyRow = {
    displayName: "Asha Rao",
    id: "party-1",
    kind: "person" as const,
    legalName: "Asha R. Rao",
    updatedAt: t0,
  };
  const stored: ExistingFillRow = {
    addressLine1: null,
    addressLine2: null,
    assessmentNote: "Indian passport seen",
    city: null,
    country: "GB",
    email: "asha@example.com",
    foreignSourceAssessment: "foreign",
    idNumberEncrypted: "v1:stored",
    idType: "passport",
    nationality: "Indian",
    phone: null,
    pincode: null,
    state: null,
    updatedAt: t1,
  };
  const row = {
    addressLine1: "12 MG Road",
    addressLine2: "",
    city: "Pune",
    email: "other@example.com",
    idNumber: "ABCDE1234F",
    idType: "pan" as const,
    phone: "+919800000000",
    pincode: "411001",
    state: "MH",
  };
  const roles = ["donor", "sponsor"] as const;

  it("takes only the gaps from the row and passes the rest through", () => {
    const save = buildFillSave(partyRow, stored, roles, row, {
      canStoreIds: true,
    });
    expect(save?.fill).toEqual(["address", "phone"]);
    expect(save?.input).toEqual({
      addressLine1: "12 MG Road",
      addressLine2: "",
      assessmentNote: "Indian passport seen",
      city: "Pune",
      country: "GB",
      displayName: "Asha Rao",
      email: "asha@example.com",
      expectedPartyUpdatedAt: t0.getTime(),
      expectedUpdatedAt: t1.getTime(),
      foreignSourceAssessment: "foreign",
      id: "party-1",
      idNumber: "",
      idType: "passport",
      kind: "person",
      legalName: "Asha R. Rao",
      mode: "update",
      nationality: "Indian",
      phone: "+919800000000",
      pincode: "411001",
      roles,
      state: "MH",
    });
  });

  it("keeps a stored identifier through resolveSecret's blank-keeps rule", () => {
    const save = buildFillSave(partyRow, stored, roles, row, {
      canStoreIds: true,
    });
    if (!save) {
      throw new Error("expected a save");
    }
    const encrypt = () => {
      throw new Error("must not re-encrypt");
    };
    expect(
      resolveSecret(save.input, { ...stored, idNumberLast4: "1234" }, encrypt)
    ).toEqual({
      cleared: false,
      idNumberEncrypted: "v1:stored",
      idNumberLast4: "1234",
    });
  });

  it("fills the identifier with the row's type when none is stored", () => {
    const save = buildFillSave(
      partyRow,
      { ...stored, idNumberEncrypted: null, idType: "none" },
      roles,
      row,
      { canStoreIds: true }
    );
    expect(save?.fill).toContain("idNumber");
    expect(save?.input).toMatchObject({
      idNumber: "ABCDE1234F",
      idType: "pan",
    });
  });

  it("leaves a partial stored address untouched", () => {
    const partial = { ...stored, addressLine2: "Near the temple", city: "" };
    const save = buildFillSave(partyRow, partial, roles, row, {
      canStoreIds: true,
    });
    expect(save?.fill).toEqual(["phone"]);
    expect(save?.input).toMatchObject({
      addressLine1: "",
      addressLine2: "Near the temple",
      city: "",
      pincode: "",
      state: "",
    });
  });

  it("treats blank and whitespace values on either side as empty", () => {
    const blankRow = {
      ...row,
      addressLine1: " ",
      city: "",
      email: "  ",
      phone: "\t",
      pincode: "",
      state: "",
    };
    expect(
      buildFillSave(partyRow, stored, roles, blankRow, { canStoreIds: true })
    ).toBeNull();
    const save = buildFillSave(
      partyRow,
      { ...stored, email: "   " },
      roles,
      { ...blankRow, email: "new@example.com" },
      { canStoreIds: true }
    );
    expect(save?.fill).toEqual(["email"]);
    expect(save?.input.email).toBe("new@example.com");
  });

  it("starts from defaults for a party without private details", () => {
    const save = buildFillSave(partyRow, null, [], row, {
      canStoreIds: false,
    });
    expect(save?.fill).toEqual(["address", "email", "phone"]);
    expect(save?.input).toMatchObject({
      assessmentNote: "",
      country: "IN",
      expectedUpdatedAt: null,
      foreignSourceAssessment: "domestic",
      idNumber: "",
      idType: "none",
      nationality: "",
      roles: [],
    });
  });
});
