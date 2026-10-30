import { describe, expect, it } from "bun:test";

import type { GovernanceValidationReport } from "@pi-dash/db/schema/governance";
import { DEED_VERSION_1 } from "@pi-dash/shared/governance";
import {
  circularReference,
  type ResolutionEffect,
  VOTE_REAUTH_MESSAGE,
} from "@pi-dash/shared/resolutions";

import {
  assertRecentSignIn,
  checkEsignedCopy,
  checkSignedUpload,
  EARLIER_SIGNATURE_UNTRUSTED_MESSAGE,
  type DraftRow,
  fieldRequests,
  planIssue,
  planStillHolds,
} from "./circulars";

const register = {
  offices: [
    {
      endEvidenceDocumentId: null,
      endedOn: null,
      id: "o1",
      office: "managing_trustee" as const,
      startEvidenceDocumentId: null,
      startsOn: "2026-04-04",
      trusteeId: "mt",
    },
  ],
  rules: DEED_VERSION_1.rules,
  terms: [
    {
      basis: "deed_original" as const,
      endEvidenceDocumentId: null,
      endedOn: null,
      endsOn: null,
      id: "t1",
      startEvidenceDocumentId: null,
      startsOn: "2019-03-16",
      trusteeId: "mt",
    },
    {
      basis: "co_option_4_5" as const,
      endEvidenceDocumentId: null,
      endedOn: null,
      endsOn: "2028-12-06",
      id: "t2",
      startEvidenceDocumentId: null,
      startsOn: "2025-12-07",
      trusteeId: "sec",
    },
  ],
  trustees: [
    { id: "mt", isCoFounder: true, legalName: "Asha Rao", userId: "u-mt" },
    { id: "sec", isCoFounder: false, legalName: "Vikram Menon", userId: null },
    { id: "new", isCoFounder: false, legalName: "Meera Iyer", userId: null },
  ],
};

const draft: DraftRow = {
  body: '[{"children":[{"text":"RESOLVED THAT the registered office be shifted."}],"type":"p"}]',
  effect: { type: "none" },
  id: "01930000-0000-7000-8000-0000000abcde",
  kind: "circular",
  status: "draft",
  templateKey: "registered_office",
  title: "Shift of the registered office",
};

const noProblem = () => null;
const unchanged = <R>(r: R) => r;

describe("planIssue", () => {
  it("sends the circular to every trustee in office, needing both of two", () => {
    const plan = planIssue({
      drafts: [draft],
      effectRegisterProblem: noProblem,
      issuer: { trusteeId: "mt" },
      register,
      registerAfterEffect: unchanged,
      today: "2026-10-20",
    });
    expect(plan.responders.map((r) => r.trusteeId).sort()).toEqual([
      "mt",
      "sec",
    ]);
    expect(plan.responders.find((r) => r.trusteeId === "mt")?.userId).toBe(
      "u-mt"
    );
    expect(plan.issuerOffice).toBe("Managing Trustee");
    expect(plan.resolutions[0]?.thresholdText).toContain("(2 of 2)");
  });

  it("refuses anyone but the Managing Trustee", () => {
    expect(() =>
      planIssue({
        drafts: [draft],
        effectRegisterProblem: noProblem,
        issuer: { trusteeId: "sec" },
        register,
        registerAfterEffect: unchanged,
        today: "2026-10-20",
      })
    ).toThrow("Only the Managing Trustee");
    expect(() =>
      planIssue({
        drafts: [draft],
        effectRegisterProblem: noProblem,
        issuer: null,
        register,
        registerAfterEffect: unchanged,
        today: "2026-10-20",
      })
    ).toThrow("isn't linked to a trustee");
  });

  it("allows only appointments below the minimum (clause 4.14)", () => {
    const short = {
      ...register,
      terms: register.terms.filter((t) => t.trusteeId === "mt"),
    };
    expect(() =>
      planIssue({
        drafts: [draft],
        effectRegisterProblem: noProblem,
        issuer: { trusteeId: "mt" },
        register: short,
        registerAfterEffect: unchanged,
        today: "2026-10-20",
      })
    ).toThrow("fill vacancies");
    const appointment: DraftRow = {
      ...draft,
      effect: {
        basis: "co_option_4_5",
        endsOn: "2029-10-19",
        startsOn: "2026-10-20",
        trusteeId: "new",
        type: "term_start",
      },
      templateKey: "appointment",
    };
    expect(
      planIssue({
        drafts: [appointment],
        effectRegisterProblem: noProblem,
        issuer: { trusteeId: "mt" },
        register: short,
        registerAfterEffect: unchanged,
        today: "2026-10-20",
      }).responders
    ).toHaveLength(1);
  });

  it("refuses a register change the register can't take, and an empty text", () => {
    expect(() =>
      planIssue({
        drafts: [draft],
        effectRegisterProblem: () => "That trustee has no open term to end.",
        issuer: { trusteeId: "mt" },
        register,
        registerAfterEffect: unchanged,
        today: "2026-10-20",
      })
    ).toThrow("no open term");
    expect(() =>
      planIssue({
        drafts: [
          { ...draft, body: '[{"children":[{"text":"  "}],"type":"p"}]' },
        ],
        effectRegisterProblem: noProblem,
        issuer: { trusteeId: "mt" },
        register,
        registerAfterEffect: unchanged,
        today: "2026-10-20",
      })
    ).toThrow("Write the resolution");
  });

  it("checks each draft against the register as the ones before it leave it", () => {
    const appointment: DraftRow = {
      ...draft,
      effect: {
        basis: "co_option_4_5",
        endsOn: null,
        startsOn: "2026-10-20",
        trusteeId: "new",
        type: "term_start",
      },
      id: "01930000-0000-7000-8000-00000000000a",
      templateKey: "appointment",
      title: "Appointment of Meera Iyer",
    };
    const designation: DraftRow = {
      ...draft,
      effect: {
        office: "secretary",
        startsOn: "2026-10-20",
        trusteeId: "new",
        type: "office_start",
      },
      id: "01930000-0000-7000-8000-00000000000b",
      templateKey: "office_bearer",
      title: "Meera Iyer as Secretary",
    };
    // An office needs its holder in office, as the register would stand.
    const effectRegisterProblem = (
      r: typeof register,
      effect: ResolutionEffect
    ) =>
      effect.type === "office_start" &&
      !r.terms.some((t) => t.trusteeId === effect.trusteeId)
        ? "The office holder isn't a trustee then."
        : null;
    const registerAfterEffect = (
      r: typeof register,
      effect: ResolutionEffect
    ) =>
      effect.type === "term_start"
        ? {
            ...r,
            terms: [
              ...r.terms,
              {
                ...r.terms[0],
                id: "t-new",
                startsOn: effect.startsOn,
                trusteeId: effect.trusteeId,
              } as (typeof r.terms)[number],
            ],
          }
        : r;
    const input = {
      effectRegisterProblem: effectRegisterProblem as never,
      issuer: { trusteeId: "mt" },
      register,
      registerAfterEffect: registerAfterEffect as never,
      today: "2026-10-20",
    };
    const plan = planIssue({ ...input, drafts: [appointment, designation] });
    expect(plan.resolutions.map((r) => r.id)).toEqual([
      appointment.id,
      designation.id,
    ]);
    expect(() =>
      planIssue({ ...input, drafts: [designation, appointment] })
    ).toThrow('Resolution 1 ("Meera Iyer as Secretary"): The office holder');
  });

  it("refuses no drafts and the same draft twice", () => {
    const input = {
      effectRegisterProblem: noProblem,
      issuer: { trusteeId: "mt" },
      register,
      registerAfterEffect: unchanged,
      today: "2026-10-20",
    };
    expect(() => planIssue({ ...input, drafts: [] })).toThrow(
      "at least one draft"
    );
    expect(() => planIssue({ ...input, drafts: [draft, draft] })).toThrow(
      "only be in the circular once"
    );
  });
});

describe("planStillHolds", () => {
  const input = {
    drafts: [draft],
    effectRegisterProblem: noProblem,
    issuer: { trusteeId: "mt" },
    registerAfterEffect: unchanged,
    today: "2026-10-20",
  };
  const prepared = planIssue({ ...input, register });

  it("holds while the register gives the same circular", () => {
    expect(
      planStillHolds(prepared, () => planIssue({ ...input, register }))
    ).toBe(true);
  });

  it("fails when a term ended meanwhile", () => {
    const ended = {
      ...register,
      terms: register.terms.map((t) =>
        t.id === "t2" ? { ...t, endedOn: "2026-10-19" } : t
      ),
    };
    expect(
      planStillHolds(prepared, () => planIssue({ ...input, register: ended }))
    ).toBe(false);
  });

  it("fails when the issuer's office ended meanwhile", () => {
    const noOffice = {
      ...register,
      offices: register.offices.map((o) => ({ ...o, endedOn: "2026-10-19" })),
    };
    expect(
      planStillHolds(prepared, () =>
        planIssue({ ...input, register: noOffice })
      )
    ).toBe(false);
  });
});

describe("fieldRequests", () => {
  it("puts the fields on the last pages, counted from the end", () => {
    const fields = fieldRequests(["a", "b", "c", "d", "e", "f"]);
    expect(fields.map((f) => f.page)).toEqual([-2, -2, -2, -2, -2, -1]);
    expect(fields[0]?.name).toBe("Trustee_a");
  });
});

describe("circularReference", () => {
  it("is short and stable", () => {
    expect(circularReference(draft.id)).toBe("C-000ABCDE");
  });
});

describe("assertRecentSignIn", () => {
  it("needs a sign-in from the last 10 minutes", () => {
    const now = new Date("2026-10-20T10:00:00Z");
    expect(() =>
      assertRecentSignIn(
        { session: { createdAt: new Date("2026-10-20T09:55:00Z") } },
        now
      )
    ).not.toThrow();
    expect(() =>
      assertRecentSignIn(
        { session: { createdAt: "2026-10-20T09:40:00Z" } },
        now
      )
    ).toThrow(VOTE_REAUTH_MESSAGE);
  });
});

function sig(
  fieldName: string,
  overrides: Partial<GovernanceValidationReport["signatures"][number]> = {}
): GovernanceValidationReport["signatures"][number] {
  return {
    certifies: false,
    coversWholeRevision: true,
    fieldName,
    intact: true,
    issuer: "CA",
    locks: [],
    matchedTrusteeId: null,
    modificationLevel: "FORM_FILLING",
    notAfter: null,
    notBefore: null,
    serial: "1",
    sha256Fingerprint: "f".repeat(64),
    signerName: "VIKRAM MENON",
    signingTime: null,
    subject: "CN=VIKRAM MENON",
    timestamped: false,
    trusted: true,
    ...overrides,
  };
}

describe("checkSignedUpload", () => {
  // The prepared copy's signature fields.
  const boxes = ["Trustee_mt", "Trustee_sec"];
  const current = new Uint8Array([1, 2, 3, 4]);
  const uploaded = new Uint8Array([1, 2, 3, 4, 5, 6]);
  const trustee = { id: "sec", names: ["Vikram Menon"] };
  const base = {
    current,
    fieldName: "Trustee_sec",
    signedBefore: 1,
    textFieldsBefore: { Answers_mt: "Resolution 1: assents", Answers_sec: "" },
    trustee,
    uploaded,
  };
  const textFields = {
    Answers_mt: "Resolution 1: assents",
    Answers_sec: "",
  };

  it("takes the trustee's signature appended to the latest PDF", () => {
    const added = checkSignedUpload({
      ...base,
      report: {
        checkedAt: "",
        signatures: [
          sig("Trustee_mt", { signerName: "ASHA RAO" }),
          sig("Trustee_sec"),
        ],
        baseSignatureFields: boxes,
        changesSinceBase: "FORM_FILLING",
        status: "valid",
        textFields,
      },
    });
    expect(added.fieldName).toBe("Trustee_sec");
  });

  it("refuses a signed copy whose answers were changed", () => {
    expect(() =>
      checkSignedUpload({
        ...base,
        report: {
          baseSignatureFields: boxes,
          checkedAt: "",
          signatures: [
            sig("Trustee_mt", { signerName: "ASHA RAO" }),
            sig("Trustee_sec"),
          ],
          status: "valid",
          textFields: { ...textFields, Answers_mt: "Resolution 1: objects" },
        },
      })
    ).toThrow("answers in the PDF were changed");
  });

  it("refuses a file that isn't the latest copy plus a signature", () => {
    const report: GovernanceValidationReport = {
      baseSignatureFields: boxes,
      checkedAt: "",
      signatures: [sig("Trustee_mt"), sig("Trustee_sec")],
      status: "valid",
    };
    expect(() =>
      checkSignedUpload({
        ...base,
        report,
        uploaded: new Uint8Array([1, 2, 9, 4, 5]),
      })
    ).toThrow("isn't the latest copy");
    expect(() =>
      checkSignedUpload({ ...base, report, uploaded: current })
    ).toThrow("no new signature");
  });

  it("refuses someone else's certificate, another box and a broken signature", () => {
    expect(() =>
      checkSignedUpload({
        ...base,
        report: {
          baseSignatureFields: boxes,
          checkedAt: "",
          signatures: [
            sig("Trustee_mt"),
            sig("Trustee_sec", { signerName: "RAVI KUMAR" }),
          ],
          status: "valid",
        },
      })
    ).toThrow("in the name of RAVI KUMAR");
    expect(() =>
      checkSignedUpload({
        ...base,
        report: {
          baseSignatureFields: boxes,
          checkedAt: "",
          signatures: [sig("Trustee_sec"), sig("Trustee_mt")],
          status: "valid",
        },
      })
    ).toThrow("your own name");
    expect(() =>
      checkSignedUpload({
        ...base,
        report: {
          baseSignatureFields: boxes,
          checkedAt: "",
          signatures: [
            sig("Trustee_mt"),
            sig("Trustee_sec", { intact: false }),
          ],
          status: "invalid",
        },
      })
    ).toThrow("doesn't check out");
    expect(() =>
      checkSignedUpload({
        ...base,
        report: {
          baseSignatureFields: boxes,
          checkedAt: "",
          signatures: [
            sig("Trustee_mt"),
            sig("Trustee_sec", {
              coversWholeRevision: false,
              error: "TimeoutError",
              intact: false,
            }),
          ],
          status: "invalid",
        },
      })
    ).toThrow("couldn't be checked (TimeoutError)");
  });

  it("refuses a signature in another trustee's box", () => {
    expect(() =>
      checkSignedUpload({
        ...base,
        report: {
          checkedAt: "",
          signatures: [
            sig("Signature1", { signerName: "ASHA RAO" }),
            sig("Trustee_mt"),
          ],
          baseSignatureFields: boxes,
          changesSinceBase: "FORM_FILLING",
          status: "valid",
          textFields,
        },
      })
    ).toThrow("your own name");
  });

  it("refuses a change the earlier signatures don't allow", () => {
    expect(() =>
      checkSignedUpload({
        ...base,
        report: {
          checkedAt: "",
          signatures: [
            sig("Trustee_mt", {
              modificationLevel: "OTHER",
              signerName: "ASHA RAO",
            }),
            sig("Trustee_sec"),
          ],
          baseSignatureFields: boxes,
          changesSinceBase: "FORM_FILLING",
          status: "valid",
          textFields,
        },
      })
    ).toThrow("don't allow");
  });

  it("refuses an untrusted certificate in the trustee's name", () => {
    expect(() =>
      checkSignedUpload({
        ...base,
        report: {
          baseSignatureFields: boxes,
          changesSinceBase: "FORM_FILLING",
          checkedAt: "",
          signatures: [
            sig("Trustee_mt", { signerName: "ASHA RAO" }),
            sig("Trustee_sec", { trusted: false }),
          ],
          status: "valid",
          textFields,
        },
      })
    ).toThrow("licensed Indian certifying authority");
  });

  it("refuses an upload counting an earlier signature that no longer validates", () => {
    expect(() =>
      checkSignedUpload({
        ...base,
        report: {
          baseSignatureFields: boxes,
          changesSinceBase: "FORM_FILLING",
          checkedAt: "",
          signatures: [
            sig("Trustee_mt", { signerName: "ASHA RAO", trusted: false }),
            sig("Trustee_sec"),
          ],
          status: "valid",
          textFields,
        },
      })
    ).toThrow(EARLIER_SIGNATURE_UNTRUSTED_MESSAGE);
  });

  it("takes a lock on the trustee's own answers, and refuses one that locks out the others", () => {
    const upload = (added: ReturnType<typeof sig>) =>
      checkSignedUpload({
        ...base,
        report: {
          baseSignatureFields: boxes,
          changesSinceBase: "FORM_FILLING",
          checkedAt: "",
          signatures: [sig("Trustee_mt", { signerName: "ASHA RAO" }), added],
          status: "valid",
          textFields,
        },
      });
    expect(
      upload(
        sig("Trustee_sec", {
          locks: [{ action: "include", fields: ["Answers_sec"] }],
        })
      ).fieldName
    ).toBe("Trustee_sec");
    for (const locks of [
      [{ action: "all" as const, fields: [] }],
      [{ action: "include" as const, fields: ["Answers_mt"] }],
      [{ action: "exclude" as const, fields: ["Answers_sec"] }],
      undefined,
    ]) {
      expect(() => upload(sig("Trustee_sec", { locks }))).toThrow(
        "locks parts of the document"
      );
    }
    for (const certifies of [true, undefined]) {
      expect(() => upload(sig("Trustee_sec", { certifies }))).toThrow(
        "certifies the document"
      );
    }
  });

  it("refuses a first signature that also changed the document", () => {
    for (const changesSinceBase of ["OTHER", "ANNOTATIONS", undefined]) {
      expect(() =>
        checkSignedUpload({
          ...base,
          report: {
            changesSinceBase,
            baseSignatureFields: boxes,
            checkedAt: "",
            signatures: [sig("Trustee_sec")],
            status: "valid",
            textFields,
          },
          signedBefore: 0,
        })
      ).toThrow("beyond adding your signature");
    }
  });

  it("refuses a signature outside the trustee's own box", () => {
    const report = (name: string): GovernanceValidationReport => ({
      checkedAt: "",
      signatures: [sig("Trustee_mt", { signerName: "ASHA RAO" }), sig(name)],
      baseSignatureFields: boxes,
      changesSinceBase: "FORM_FILLING",
      status: "valid",
      textFields,
    });
    expect(() =>
      checkSignedUpload({ ...base, report: report("Signature1") })
    ).toThrow("Sign in your own box");
    expect(() =>
      checkSignedUpload({ ...base, report: report("Trustee_mt") })
    ).toThrow("your own name");
    expect(() =>
      checkSignedUpload({
        ...base,
        report: { ...report("Trustee_sec"), baseSignatureFields: undefined },
      })
    ).toThrow("couldn't be checked");
  });

  it("refuses when the signing service can't check it", () => {
    expect(() =>
      checkSignedUpload({
        ...base,
        report: {
          checkedAt: "",
          message: "The signing service isn't configured",
          signatures: [],
          status: "unavailable",
        },
      })
    ).toThrow("isn't configured");
  });
});

describe("checkEsignedCopy", () => {
  const current = new Uint8Array([1, 2, 3, 4]);
  const signed = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const trustees = [
    { id: "mt", names: ["Asha Rao"] },
    { id: "sec", names: ["Vikram Menon"] },
    { id: "new", names: ["Meera Iyer"] },
  ];
  const unsigned = [
    { box: [300, 600, 547, 672] as const, page: 2, trusteeId: "mt" },
    { box: [300, 472, 547, 544] as const, page: 2, trusteeId: "sec" },
  ];
  const esig = (
    fieldName: string,
    overrides: Partial<GovernanceValidationReport["signatures"][number]>
  ) =>
    sig(fieldName, {
      locks: [],
      page: 2,
      timestamped: true,
      timestampTime: "2026-11-01T10:00:00+00:00",
      ...overrides,
    });
  const report = (
    signatures: GovernanceValidationReport["signatures"],
    overrides: Partial<GovernanceValidationReport> = {}
  ): GovernanceValidationReport => ({
    baseSignatureFields: [],
    changesSinceBase: "FORM_FILLING",
    checkedAt: "",
    signatures,
    status: "valid",
    ...overrides,
  });
  const vikram = esig("leegality_2", { end: 8, rect: [310, 480, 409, 539] });
  const check = (
    signatures: GovernanceValidationReport["signatures"],
    overrides: Partial<Parameters<typeof checkEsignedCopy>[0]> = {}
  ) =>
    checkEsignedCopy({
      current,
      report: report(signatures),
      signed,
      signedBefore: 0,
      trustees,
      unsigned,
      ...overrides,
    });

  it("takes each new signature for the trustee whose box it is in", () => {
    const added = check([
      esig("leegality_1", {
        end: 6,
        rect: [310, 610, 409, 669],
        signerName: "ASHA RAO",
      }),
      vikram,
    ]);
    expect(added.map((a) => [a.trusteeId, a.end, a.signedAt])).toEqual([
      ["mt", 6, "2026-11-01T10:00:00+00:00"],
      ["sec", 8, "2026-11-01T10:00:00+00:00"],
    ]);
  });

  it("has nothing to take from Leegality's copy as it was", () => {
    expect(check([], { signed: current })).toEqual([]);
  });

  it("refuses a copy that doesn't extend the one on record", () => {
    expect(() =>
      check([vikram], { signed: new Uint8Array([9, 2, 3, 4, 5, 6, 7, 8]) })
    ).toThrow("no longer extends");
  });

  it("refuses a signature outside every unsigned trustee's box", () => {
    expect(() =>
      check([esig("leegality_2", { end: 8, rect: [10, 10, 99, 69] })])
    ).toThrow("isn't in a box");
  });

  it("refuses an eSign in another trustee's name, or a name more than one could have", () => {
    expect(() => check([{ ...vikram, signerName: "MEERA IYER" }])).toThrow(
      "MEERA IYER"
    );
    expect(() =>
      check([vikram], {
        trustees: [...trustees, { id: "twin", names: ["Vikram Menon"] }],
      })
    ).toThrow("doesn't match");
  });

  it("refuses an untrusted certificate, a lock, a certification or no timestamp", () => {
    for (const changed of [
      { trusted: false },
      { locks: [{ action: "all" as const, fields: [] }] },
      { certifies: true },
      { timestamped: false },
      { timestampTime: null },
    ]) {
      expect(() => check([{ ...vikram, ...changed }])).toThrow();
    }
  });

  it("refuses changes beyond adding signatures, or after the last one", () => {
    expect(() =>
      checkEsignedCopy({
        current,
        report: report([vikram], { changesSinceBase: "OTHER" }),
        signed,
        signedBefore: 0,
        trustees,
        unsigned,
      })
    ).toThrow("changed more than adding signatures");
    expect(() => check([{ ...vikram, end: 7 }])).toThrow(
      "changes after its last signature"
    );
  });

  it("stops at an earlier signature that no longer validates", () => {
    expect(() =>
      check(
        [
          esig("leegality_1", {
            end: 4,
            signerName: "ASHA RAO",
            trusted: false,
          }),
          vikram,
        ],
        { signedBefore: 1, unsigned: unsigned.slice(1) }
      )
    ).toThrow(EARLIER_SIGNATURE_UNTRUSTED_MESSAGE);
  });
});
