import { describe, expect, it } from "vitest";

import {
  PartyConflictError,
  resolveAssessedOn,
  resolveSaveMode,
  resolveSecret,
} from "./party-save-rules";

const t0 = new Date("2026-10-13T06:00:00Z");
const t1 = new Date("2026-10-13T07:00:00Z");
const actor = "user-1";
const partyRow = (
  overrides: Partial<{ createdBy: string; updatedAt: Date }> = {}
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
