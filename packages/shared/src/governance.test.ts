import { describe, expect, it } from "vitest";

import {
  boardOn,
  DEED_VERSION_1,
  deedVersionOn,
  isHeldOn,
  isIsoDate,
  lastDayOf,
  matchSignerToTrustee,
  newRegisterProblems,
  type OfficeRow,
  quorumFor,
  type RegisterInput,
  registerWarnings,
  type TermRow,
  termDateProblem,
  termsDueForReminder,
} from "./governance";

const rules = DEED_VERSION_1.rules;

function term(partial: Partial<TermRow> & Pick<TermRow, "id" | "trusteeId">) {
  return {
    basis: "co_option_4_5",
    endEvidenceDocumentId: null,
    endedOn: null,
    endsOn: null,
    startEvidenceDocumentId: "doc",
    startsOn: "2019-03-16",
    ...partial,
  } satisfies TermRow;
}

function office(
  partial: Partial<OfficeRow> & Pick<OfficeRow, "id" | "office" | "trusteeId">
) {
  return {
    endEvidenceDocumentId: null,
    endedOn: null,
    startEvidenceDocumentId: "doc",
    startsOn: "2019-03-16",
    ...partial,
  } satisfies OfficeRow;
}

/** The board at design time in governance.md, trimmed. */
function boardAtDesign(): RegisterInput {
  return {
    offices: [
      office({
        endEvidenceDocumentId: "resignation",
        endedOn: "2026-04-04",
        id: "o-chenthil-mt",
        office: "managing_trustee",
        trusteeId: "chenthil",
      }),
      office({
        id: "o-sarjun-mt",
        office: "managing_trustee",
        startsOn: "2026-04-04",
        trusteeId: "sarjun",
      }),
      office({
        id: "o-somu-sec",
        office: "secretary",
        startsOn: "2025-12-07",
        trusteeId: "somu",
      }),
      office({
        id: "o-somu-jmt",
        office: "joint_managing_trustee",
        startsOn: "2026-10-18",
        trusteeId: "somu",
      }),
    ],
    rules,
    terms: [
      term({ basis: "deed_original", id: "t-sarjun", trusteeId: "sarjun" }),
      term({
        basis: "deed_original",
        endEvidenceDocumentId: "resignation",
        endedOn: "2026-04-04",
        id: "t-chenthil",
        trusteeId: "chenthil",
      }),
      term({
        endsOn: "2028-12-06",
        id: "t-somu",
        startsOn: "2025-12-07",
        trusteeId: "somu",
      }),
      term({
        endedOn: "2026-10-16",
        id: "t-sameedha",
        startEvidenceDocumentId: null,
        startsOn: "2024-01-01",
        trusteeId: "sameedha",
      }),
    ],
    trustees: [
      { id: "sarjun", isCoFounder: true, legalName: "Sarjun H Hajathulla" },
      { id: "chenthil", isCoFounder: true, legalName: "Chenthil Kumar S" },
      { id: "somu", isCoFounder: false, legalName: "Somasundaram Ayyappan" },
      {
        id: "sameedha",
        isCoFounder: false,
        legalName: "Sameedha Vinaykumar Salvi",
      },
    ],
  };
}

describe("periods", () => {
  it("treats endsOn as the last day and endedOn as the first day out", () => {
    const fixed = {
      endedOn: null,
      endsOn: "2028-12-06",
      startsOn: "2025-12-07",
    };
    expect(isHeldOn(fixed, "2028-12-06")).toBe(true);
    expect(isHeldOn(fixed, "2028-12-07")).toBe(false);
    expect(isHeldOn(fixed, "2025-12-06")).toBe(false);

    const resigned = { endedOn: "2026-04-04", startsOn: "2019-03-16" };
    expect(isHeldOn(resigned, "2026-04-03")).toBe(true);
    expect(isHeldOn(resigned, "2026-04-04")).toBe(false);
    expect(lastDayOf(resigned)).toBe("2026-04-03");
  });

  it("takes the earlier of a resignation and a fixed end", () => {
    expect(lastDayOf({ endedOn: "2027-01-10", endsOn: "2028-12-06" })).toBe(
      "2027-01-09"
    );
    expect(lastDayOf({ endedOn: null, endsOn: null })).toBeNull();
  });
});

describe("boardOn", () => {
  it("answers who was a trustee, in which offices, on a date", () => {
    const input = boardAtDesign();
    const before = boardOn(input, "2026-04-03");
    expect(before.map((m) => m.trustee.id)).toEqual([
      "chenthil",
      "sameedha",
      "sarjun",
      "somu",
    ]);
    expect(before.find((m) => m.trustee.id === "chenthil")?.offices).toEqual([
      "managing_trustee",
    ]);

    const after = boardOn(input, "2026-10-18");
    expect(after.map((m) => m.trustee.id)).toEqual(["sarjun", "somu"]);
    expect(after.find((m) => m.trustee.id === "somu")?.offices).toEqual([
      "joint_managing_trustee",
      "secretary",
    ]);
  });
});

describe("deed versions and quorum", () => {
  it("picks the latest version in force on a date", () => {
    const versions = [
      { effectiveFrom: "2019-03-16", id: "v1", number: 1 },
      { effectiveFrom: "2027-02-01", id: "v2", number: 2 },
    ];
    expect(deedVersionOn(versions, "2026-10-18")?.id).toBe("v1");
    expect(deedVersionOn(versions, "2027-02-01")?.id).toBe("v2");
    expect(deedVersionOn(versions, "2019-01-01")).toBeNull();
  });

  it("uses a fixed head count under version 1 and a floored share otherwise", () => {
    expect(quorumFor(rules, 2)).toBe(5);
    const half = {
      ...rules,
      quorumFloor: 2,
      quorumKind: "fraction" as const,
      quorumValue: 50,
    };
    expect(quorumFor(half, 2)).toBe(2);
    expect(quorumFor(half, 5)).toBe(3);
    expect(quorumFor(half, 9)).toBe(5);
  });
});

describe("registerWarnings", () => {
  it("flags the two-trustee board's meeting quorum and the vacant chair", () => {
    const codes = registerWarnings(boardAtDesign(), "2026-10-18").map(
      (w) => w.code
    );
    expect(codes).toContain("meeting_quorum_unreachable");
    expect(codes).toContain("no_casting_vote");
    expect(codes).not.toContain("below_minimum");
    expect(codes).not.toContain("no_managing_trustee");
  });

  it("marks a start date with no document as unevidenced", () => {
    const warnings = registerWarnings(boardAtDesign(), "2026-10-18");
    const unevidenced = warnings.filter((w) => w.code === "unevidenced");
    expect(unevidenced.map((w) => w.rowIds[0])).toContain("t-sameedha");
    // Sameedha's end has no document either.
    expect(
      unevidenced.find((w) => w.rowIds[0] === "t-sameedha")?.message
    ).toContain("start and end");
  });

  it("warns loudly when an ending term would take the board below two", () => {
    const warnings = registerWarnings(boardAtDesign(), "2028-10-01");
    expect(warnings[0]?.severity).toBe("error");
    const codes = warnings.map((w) => w.code);
    expect(codes).toContain("term_ending_soon");
    expect(codes).toContain("term_end_below_minimum");
  });

  it("flags two holders of one office and an office outside its term", () => {
    const input = boardAtDesign();
    const broken: RegisterInput = {
      ...input,
      offices: [
        ...input.offices,
        office({
          id: "o-somu-mt",
          office: "managing_trustee",
          startsOn: "2026-05-01",
          trusteeId: "somu",
        }),
        office({
          id: "o-sameedha-vp",
          office: "vice_president",
          startsOn: "2023-01-01",
          trusteeId: "sameedha",
        }),
      ],
    };
    const codes = registerWarnings(broken, "2026-10-18").map((w) => w.code);
    expect(codes).toContain("office_overlap");
    expect(codes).toContain("office_outside_term");
  });

  it("flags a co-option longer than three years", () => {
    const input = boardAtDesign();
    const long: RegisterInput = {
      ...input,
      terms: input.terms.map((t) =>
        t.id === "t-somu" ? { ...t, endsOn: "2029-12-06" } : t
      ),
    };
    expect(registerWarnings(long, "2026-10-18").map((w) => w.code)).toContain(
      "co_option_too_long"
    );
    expect(
      registerWarnings(boardAtDesign(), "2026-10-18").map((w) => w.code)
    ).not.toContain("co_option_too_long");
  });
});

describe("newRegisterProblems", () => {
  it("refuses only the problems a change introduces", () => {
    const before = boardAtDesign();
    const after: RegisterInput = {
      ...before,
      offices: [
        ...before.offices,
        office({
          id: "o-new",
          office: "secretary",
          startsOn: "2026-01-01",
          trusteeId: "sarjun",
        }),
      ],
    };
    expect(newRegisterProblems(before, after)).toHaveLength(1);
    expect(newRegisterProblems(after, after)).toEqual([]);
  });

  it("catches an office left outside a shortened term", () => {
    const before = boardAtDesign();
    const after: RegisterInput = {
      ...before,
      terms: before.terms.map((t) =>
        t.id === "t-somu" ? { ...t, endedOn: "2026-06-01" } : t
      ),
    };
    expect(newRegisterProblems(before, after)[0]).toContain(
      "outside their term"
    );
  });
});

describe("reminders and input checks", () => {
  it("finds terms exactly 90, 30 or 7 days from their last day", () => {
    const { terms } = boardAtDesign();
    expect(termsDueForReminder(terms, "2028-09-07")).toEqual([
      { daysLeft: 90, term: terms[2] },
    ]);
    expect(termsDueForReminder(terms, "2028-11-29")[0]?.daysLeft).toBe(7);
    expect(termsDueForReminder(terms, "2028-11-30")).toEqual([]);
  });

  it("checks dates", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("18-10-2026")).toBe(false);
    expect(
      termDateProblem({
        endedOn: null,
        endsOn: "2025-01-01",
        startsOn: "2025-12-07",
      })
    ).not.toBeNull();
    expect(
      termDateProblem({
        endedOn: "2025-12-07",
        endsOn: null,
        startsOn: "2025-12-07",
      })
    ).not.toBeNull();
  });
});

describe("matchSignerToTrustee", () => {
  const trustees = [
    { id: "sarjun", names: ["Sarjun H Hajathulla"] },
    { id: "somu", names: ["Somasundaram Ayyappan", "AYYAPPAN SOMASUNDARAM"] },
    { id: "chenthil", names: ["Chenthil Kumar S"] },
  ];

  it("matches a DSC common name in capitals, in any order, with initials", () => {
    expect(matchSignerToTrustee("SARJUN H HAJATHULLA", trustees)).toBe(
      "sarjun"
    );
    expect(matchSignerToTrustee("Sarjun Hameed Hajathulla", trustees)).toBe(
      "sarjun"
    );
    expect(matchSignerToTrustee("AYYAPPAN SOMASUNDARAM", trustees)).toBe(
      "somu"
    );
    expect(matchSignerToTrustee("S CHENTHIL KUMAR", trustees)).toBe("chenthil");
  });

  it("gives no match for strangers, empty names or ambiguity", () => {
    expect(matchSignerToTrustee("RAVI KUMAR", trustees)).toBeNull();
    expect(matchSignerToTrustee(null, trustees)).toBeNull();
    expect(
      matchSignerToTrustee("A B", [
        { id: "1", names: ["Anil Bose"] },
        { id: "2", names: ["Arun Basu"] },
      ])
    ).toBeNull();
  });
});
