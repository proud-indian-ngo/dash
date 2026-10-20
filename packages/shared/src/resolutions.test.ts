import { describe, expect, it } from "vitest";

import { DEED_VERSION_1, type OfficeRow, type TermRow } from "./governance";
import {
  A4,
  effectProblem,
  formatResolutionNumber,
  mayIssueCircular,
  neededFor,
  officesEndedBy,
  parseResolutionNumber,
  RESOLUTION_TEMPLATES,
  type ResponseState,
  responseDatePassed,
  signatureFieldBox,
  signaturePageCount,
  signatureSlots,
  tallyCircular,
  termEndedBy,
  thresholdFor,
} from "./resolutions";

function r(
  trusteeId: string,
  response: ResponseState["response"],
  options: { conflict?: boolean; signed?: boolean } = {}
): ResponseState {
  return {
    conflictDeclared: options.conflict ?? false,
    response,
    signed: options.signed ?? response === "assent",
    trusteeId,
  };
}

const base = {
  dueOn: "2026-10-25",
  subjectTrusteeId: null,
  threshold: "majority_in_office" as const,
  today: "2026-10-20",
};

describe("neededFor", () => {
  it("is a majority, two-thirds, or everyone eligible", () => {
    expect(neededFor("majority_in_office", 2)).toBe(2);
    expect(neededFor("majority_in_office", 5)).toBe(3);
    expect(neededFor("majority_in_office", 6)).toBe(4);
    expect(neededFor("two_thirds_in_office", 2)).toBe(2);
    expect(neededFor("two_thirds_in_office", 5)).toBe(4);
    expect(neededFor("two_thirds_in_office", 9)).toBe(6);
    expect(neededFor("unanimous_others", 4)).toBe(4);
  });
});

describe("tallyCircular", () => {
  it("passes a two-trustee circular only with both signatures", () => {
    const one = tallyCircular({
      ...base,
      responses: [r("a", "assent"), r("b", "pending")],
    });
    expect(one).toMatchObject({ assents: 1, needed: 2, outcome: "open" });
    const both = tallyCircular({
      ...base,
      responses: [r("a", "assent"), r("b", "assent")],
    });
    expect(both.outcome).toBe("passed");
  });

  it("counts an assent only once it is signed", () => {
    const tally = tallyCircular({
      ...base,
      responses: [r("a", "assent"), r("b", "assent", { signed: false })],
    });
    expect(tally.outcome).toBe("open");
  });

  it("fails as soon as objections make the threshold unreachable", () => {
    const tally = tallyCircular({
      ...base,
      responses: [r("a", "assent"), r("b", "objection"), r("c", "pending")],
    });
    expect(tally.outcome).toBe("open");
    const failed = tallyCircular({
      ...base,
      responses: [r("a", "objection"), r("b", "objection"), r("c", "pending")],
    });
    expect(failed.outcome).toBe("failed");
    expect(failed.reason).toContain("2 objections");
  });

  it("leaves conflicted trustees out of the count", () => {
    const tally = tallyCircular({
      ...base,
      responses: [
        r("a", "assent"),
        r("b", "assent"),
        r("c", "pending", { conflict: true }),
      ],
    });
    expect(tally).toMatchObject({ eligible: 2, needed: 2, outcome: "passed" });
  });

  it("fails after the response date", () => {
    const tally = tallyCircular({
      ...base,
      responses: [r("a", "assent"), r("b", "pending")],
      today: "2026-10-26",
    });
    expect(tally.outcome).toBe("failed");
    expect(tally.reason).toContain("response date");
  });

  it("takes responses through the response date and none after it", () => {
    expect(responseDatePassed("2026-10-25", "2026-10-25")).toBe(false);
    expect(responseDatePassed("2026-10-25", "2026-10-26")).toBe(true);
  });

  it("needs every other trustee for a removal, never the subject", () => {
    const responses = [
      r("a", "assent"),
      r("b", "assent"),
      r("subject", "objection"),
    ];
    const tally = tallyCircular({
      ...base,
      responses,
      subjectTrusteeId: "subject",
      threshold: "unanimous_others",
    });
    expect(tally).toMatchObject({ eligible: 2, needed: 2, outcome: "passed" });
  });

  it("fails when no one can vote", () => {
    const tally = tallyCircular({
      ...base,
      responses: [r("a", "pending", { conflict: true })],
    });
    expect(tally.outcome).toBe("failed");
  });
});

describe("officesEndedBy", () => {
  const term = (id: string, trusteeId: string, endsOn: string | null) => ({
    basis: "co_option_4_5" as const,
    endEvidenceDocumentId: null,
    endedOn: null,
    endsOn,
    id,
    startEvidenceDocumentId: null,
    startsOn: "2020-01-01",
    trusteeId,
  });
  const office = (id: string, trusteeId: string, startsOn: string) => ({
    endEvidenceDocumentId: null,
    endedOn: null,
    id,
    office: "secretary" as const,
    startEvidenceDocumentId: null,
    startsOn,
    trusteeId,
  });
  // a's fixed term ran out with their office still recorded open; b holds it now.
  const register = {
    offices: [
      office("expired", "a", "2020-01-01"),
      office("held", "b", "2023-01-01"),
    ],
    terms: [term("a-term", "a", "2022-12-31"), term("b-term", "b", null)],
  };

  it("ends only the office held on the designation day", () => {
    expect(
      officesEndedBy(register, {
        office: "secretary",
        startsOn: "2024-01-01",
        trusteeId: "c",
        type: "office_start",
      })
    ).toEqual(["held"]);
  });

  it("leaves an office that ended with its term out of a later cessation", () => {
    const effect = {
      cessationBasis: "resignation" as const,
      endedOn: "2024-01-01",
      type: "term_end" as const,
    };
    expect(officesEndedBy(register, { ...effect, trusteeId: "a" })).toEqual([]);
    expect(officesEndedBy(register, { ...effect, trusteeId: "b" })).toEqual([
      "held",
    ]);
  });
});

describe("termEndedBy", () => {
  const term = (id: string, startsOn: string, endsOn: string | null) => ({
    basis: "co_option_4_5" as const,
    endEvidenceDocumentId: null,
    endedOn: null,
    endsOn,
    id,
    startEvidenceDocumentId: null,
    startsOn,
    trusteeId: "a",
  });
  // A term that ran to its end date keeps no recorded end.
  const terms: TermRow[] = [
    term("expired", "2019-03-16", "2022-03-15"),
    term("current", "2023-01-01", "2025-12-31"),
    { ...term("ended", "2017-01-01", null), endedOn: "2018-01-01" },
    { ...term("other", "2023-01-01", null), trusteeId: "b" },
  ];

  it("ends the trustee's latest open term begun before the day", () => {
    expect(termEndedBy(terms, "a", "2024-06-01")?.id).toBe("current");
    expect(termEndedBy(terms, "a", "2020-06-01")?.id).toBe("expired");
  });

  it("finds none when no open term began before the day", () => {
    expect(termEndedBy(terms, "a", "2019-03-16")).toBeNull();
    expect(termEndedBy(terms, "c", "2024-06-01")).toBeNull();
  });
});

describe("templates", () => {
  it("uses the deed's threshold for an amendment", () => {
    expect(
      thresholdFor(RESOLUTION_TEMPLATES.deed_amendment, DEED_VERSION_1.rules)
    ).toBe("two_thirds_in_office");
    expect(
      thresholdFor(RESOLUTION_TEMPLATES.ordinary, DEED_VERSION_1.rules)
    ).toBe("majority_in_office");
  });

  it("checks the effect against the template", () => {
    expect(
      effectProblem(RESOLUTION_TEMPLATES.appointment, { type: "none" })
    ).not.toBeNull();
    expect(
      effectProblem(RESOLUTION_TEMPLATES.removal, {
        endedOn: "2026-11-01",
        hearingNote: " ",
        hearingOn: "2026-10-20",
        trusteeId: "x",
        type: "removal",
      })
    ).toContain("hearing");
    expect(
      effectProblem(RESOLUTION_TEMPLATES.appointment, {
        basis: "co_option_4_5",
        endsOn: "2029-01-01",
        startsOn: "2026-01-02",
        trusteeId: "x",
        type: "term_start",
      })
    ).toBeNull();
  });
});

describe("mayIssueCircular", () => {
  const terms: TermRow[] = [
    {
      basis: "deed_original",
      endEvidenceDocumentId: null,
      endedOn: null,
      endsOn: null,
      id: "t1",
      startEvidenceDocumentId: null,
      startsOn: "2019-03-16",
      trusteeId: "mt",
    },
    {
      basis: "co_option_4_5",
      endEvidenceDocumentId: null,
      endedOn: null,
      endsOn: "2028-12-06",
      id: "t2",
      startEvidenceDocumentId: null,
      startsOn: "2025-12-07",
      trusteeId: "jmt",
    },
  ];
  const offices: OfficeRow[] = [
    {
      endEvidenceDocumentId: null,
      endedOn: null,
      id: "o1",
      office: "managing_trustee",
      startEvidenceDocumentId: null,
      startsOn: "2026-04-04",
      trusteeId: "mt",
    },
    {
      endEvidenceDocumentId: null,
      endedOn: null,
      id: "o2",
      office: "joint_managing_trustee",
      startEvidenceDocumentId: null,
      startsOn: "2026-10-18",
      trusteeId: "jmt",
    },
  ];
  const v2 = {
    ...DEED_VERSION_1.rules,
    circularIssuers: ["managing_trustee", "joint_managing_trustee"] as (
      | "managing_trustee"
      | "joint_managing_trustee"
    )[],
  };

  it("lets only the Managing Trustee issue under version 1", () => {
    const input = { offices, rules: DEED_VERSION_1.rules, terms };
    expect(mayIssueCircular(input, "mt", "2026-10-20")).toBe(true);
    expect(mayIssueCircular(input, "jmt", "2026-10-20")).toBe(false);
  });

  it("falls back to the next office only when the first is vacant", () => {
    expect(
      mayIssueCircular({ offices, rules: v2, terms }, "jmt", "2026-10-20")
    ).toBe(false);
    const vacant = offices.filter((o) => o.id !== "o1");
    expect(
      mayIssueCircular(
        { offices: vacant, rules: v2, terms },
        "jmt",
        "2026-10-20"
      )
    ).toBe(true);
  });
});

describe("numbers", () => {
  it("formats and parses the register number", () => {
    expect(formatResolutionNumber("2026-27", 3)).toBe("PI/TR/2026-27/003");
    expect(parseResolutionNumber("PI/TR/2026-27/001")).toEqual({
      fiscalYear: "2026-27",
      sequence: 1,
    });
    expect(parseResolutionNumber("PI/2026/1")).toBeNull();
  });
});

describe("signature page layout", () => {
  it("puts five blocks on a page, inside the page", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const slots = signatureSlots(ids);
    expect(signaturePageCount(ids.length)).toBe(2);
    expect(slots[5]).toMatchObject({ pageOffset: 1, top: slots[0]?.top });
    for (const slot of slots) {
      const [x1, y1, x2, y2] = signatureFieldBox(slot);
      expect(x1).toBeGreaterThan(0);
      expect(y1).toBeGreaterThan(40);
      expect(x2).toBeLessThan(A4.width);
      expect(y2).toBeLessThan(A4.height);
      expect(y2 - y1).toBeGreaterThan(50);
    }
    expect(new Set(slots.map((s) => s.fieldName)).size).toBe(6);
  });
});
