import { describe, expect, it } from "vitest";

import { type DeedRules, DEED_VERSION_1 } from "./governance";
import {
  absenceFlags,
  type AttendanceRow,
  countableVotes,
  itemQuorum,
  itemResult,
  kolkataInstant,
  kolkataParts,
  noticeProblem,
  type VoteRow,
} from "./meetings";

const v1 = DEED_VERSION_1.rules;
/** The planned amendment: half the trustees in office, at least two, video counts. */
const v2: DeedRules = {
  ...v1,
  circularIssuers: ["managing_trustee", "joint_managing_trustee"],
  electronicCirculation: true,
  quorumFloor: 2,
  quorumKind: "fraction",
  quorumValue: 50,
  videoCountsPresent: true,
};

const mt: AttendanceRow = {
  offices: ["managing_trustee"],
  presence: "in_person",
  trusteeId: "mt",
};
const jmt: AttendanceRow = {
  offices: ["joint_managing_trustee"],
  presence: "video",
  trusteeId: "jmt",
};

function vote(
  trusteeId: string,
  choice: VoteRow["choice"],
  extra: Partial<VoteRow> = {}
): VoteRow {
  return {
    absenteeWritten: false,
    choice,
    conflict: false,
    trusteeId,
    ...extra,
  };
}

describe("notice", () => {
  it("needs seven days under both versions", () => {
    expect(noticeProblem(v1, "2026-10-17", "2026-10-23")).toContain("7 days");
    expect(noticeProblem(v1, "2026-10-17", "2026-10-24")).toBeNull();
  });
});

describe("itemQuorum", () => {
  it("can't be met by two trustees under version 1", () => {
    const quorum = itemQuorum({
      attendance: [mt, { ...jmt, presence: "in_person" }],
      conflicted: [],
      inOffice: 2,
      rules: v1,
    });
    expect(quorum).toMatchObject({ needed: 5, quorate: false });
  });

  it("counts video and half the board under version 2", () => {
    expect(
      itemQuorum({
        attendance: [mt, jmt],
        conflicted: [],
        inOffice: 2,
        rules: v2,
      })
    ).toMatchObject({ counted: 2, needed: 2, quorate: true });
    expect(
      itemQuorum({
        attendance: [mt, jmt],
        conflicted: [],
        inOffice: 2,
        rules: v1,
      }).reason
    ).toContain("video doesn't count");
  });

  it("leaves a conflicted trustee out and needs the Managing Trustee", () => {
    expect(
      itemQuorum({
        attendance: [mt, jmt],
        conflicted: ["jmt"],
        inOffice: 2,
        rules: v2,
      }).quorate
    ).toBe(false);
    const withoutMt = itemQuorum({
      attendance: [
        { ...mt, presence: "absent_with_leave" },
        jmt,
        { offices: [], presence: "in_person", trusteeId: "t3" },
      ],
      conflicted: [],
      inOffice: 3,
      rules: v2,
    });
    expect(withoutMt).toMatchObject({ quorate: false });
    expect(withoutMt.reason).toContain("Managing Trustee");
  });
});

describe("itemResult", () => {
  const quorate = { counted: 2, needed: 2, quorate: true, reason: null };

  it("passes on a simple majority, counting written votes of absent trustees", () => {
    const result = itemResult({
      castingVote: null,
      quorum: quorate,
      rules: v2,
      votes: [
        vote("mt", "for"),
        vote("jmt", "against"),
        vote("t3", "for", { absenteeWritten: true }),
      ],
    });
    expect(result).toMatchObject({ against: 1, for: 2, outcome: "passed" });
  });

  it("decides a tie by the chair's casting vote, or fails without one", () => {
    const tie = [vote("mt", "for"), vote("jmt", "against")];
    expect(
      itemResult({ castingVote: "for", quorum: quorate, rules: v2, votes: tie })
    ).toMatchObject({ outcome: "passed", usedCastingVote: true });
    expect(
      itemResult({ castingVote: null, quorum: quorate, rules: v2, votes: tie })
        .outcome
    ).toBe("failed");
    expect(
      itemResult({
        castingVote: "for",
        quorum: quorate,
        rules: { ...v2, castingVote: "none" },
        votes: tie,
      }).outcome
    ).toBe("failed");
  });

  it("records no decision when inquorate, and ignores conflicted votes", () => {
    expect(
      itemResult({
        castingVote: null,
        quorum: { counted: 1, needed: 2, quorate: false, reason: "short" },
        rules: v2,
        votes: [vote("mt", "for")],
      }).outcome
    ).toBe("no_decision");
    expect(
      itemResult({
        castingVote: null,
        quorum: quorate,
        rules: v2,
        votes: [vote("mt", "for"), vote("jmt", "against", { conflict: true })],
      }).outcome
    ).toBe("passed");
  });
});

describe("countableVotes", () => {
  it("counts trustees present and written views, not a video vote under version 1", () => {
    const attendance: AttendanceRow[] = [
      mt,
      jmt,
      { offices: [], presence: "absent", trusteeId: "t3" },
      { offices: [], presence: "absent", trusteeId: "t4" },
    ];
    const votes = [
      vote("mt", "for"),
      vote("jmt", "for"),
      vote("t3", "against", { absenteeWritten: true }),
      vote("t4", "against"),
      vote("stranger", "for"),
    ];
    expect(
      countableVotes(v1, attendance, votes).map((v) => v.trusteeId)
    ).toEqual(["mt", "t3"]);
    expect(
      countableVotes(v2, attendance, votes).map((v) => v.trusteeId)
    ).toEqual(["mt", "jmt", "t3"]);
  });
});

describe("absenceFlags", () => {
  const meeting = (heldOn: string, presence: AttendanceRow["presence"]) => ({
    attendance: [
      { presence: "in_person" as const, trusteeId: "mt" },
      { presence, trusteeId: "x" },
    ],
    heldOn,
  });

  it("flags three absences in a row covering six months", () => {
    const meetings = [
      meeting("2026-01-10", "absent"),
      meeting("2026-04-10", "absent"),
      meeting("2026-08-10", "absent"),
    ];
    expect(absenceFlags(meetings, "2026-09-01")).toEqual(["x"]);
  });

  it("doesn't flag leave or a shorter run", () => {
    expect(
      absenceFlags(
        [
          meeting("2026-01-10", "absent"),
          meeting("2026-04-10", "absent_with_leave"),
          meeting("2026-08-10", "absent"),
        ],
        "2026-09-01"
      )
    ).toEqual([]);
    expect(
      absenceFlags(
        [meeting("2026-08-10", "absent"), meeting("2026-08-20", "absent")],
        "2026-09-01"
      )
    ).toEqual([]);
  });
});

describe("India time", () => {
  it("round-trips a meeting's start", () => {
    const at = kolkataInstant("2026-10-20", "10:30");
    expect(new Date(at).toISOString()).toBe("2026-10-20T05:00:00.000Z");
    expect(kolkataParts(at)).toEqual({ date: "2026-10-20", time: "10:30" });
    expect(kolkataParts(kolkataInstant("2026-10-21", "00:15")).date).toBe(
      "2026-10-21"
    );
  });
});
