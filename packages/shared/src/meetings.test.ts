import { describe, expect, it } from "vitest";

import { type DeedRules, DEED_VERSION_1 } from "./governance";
import {
  absenceFlags,
  attendanceChanges,
  type AttendanceRow,
  countableVotes,
  countedVotes,
  itemQuorum,
  itemResult,
  kolkataInstant,
  meetingCancelling,
  meetingClosing,
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
  const ordinary = {
    effect: { type: "none" } as const,
    templateKey: "ordinary" as const,
  };
  const present = (trusteeId: string): AttendanceRow => ({
    offices: [],
    presence: "in_person",
    trusteeId,
  });
  /** Version 1's quorum of five, with the Managing Trustee. */
  const five = [mt, present("t2"), present("t3"), present("t4"), present("t5")];
  const decide = (input: {
    attendance?: AttendanceRow[];
    castingVote?: VoteRow["choice"] | null;
    chairTrusteeId?: string | null;
    resolution?: Parameters<typeof itemResult>[0]["resolution"];
    rules?: DeedRules;
    votes: VoteRow[];
  }) =>
    itemResult({
      attendance: input.attendance ?? [mt, jmt],
      castingVote: input.castingVote ?? null,
      chairTrusteeId: input.chairTrusteeId ?? "mt",
      inOffice: (input.attendance ?? [mt, jmt]).length,
      resolution: input.resolution ?? ordinary,
      rules: input.rules ?? v2,
      votes: input.votes,
    });

  it("passes on a simple majority, counting written votes of absent trustees", () => {
    const result = decide({
      attendance: [
        mt,
        jmt,
        { offices: [], presence: "absent", trusteeId: "t3" },
      ],
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
    expect(decide({ castingVote: "for", votes: tie })).toMatchObject({
      outcome: "passed",
      usedCastingVote: true,
    });
    expect(decide({ votes: tie }).outcome).toBe("failed");
    expect(
      decide({
        castingVote: "for",
        rules: { ...v2, castingVote: "none" },
        votes: tie,
      }).outcome
    ).toBe("failed");
  });

  it("doesn't count the casting vote of a chair who is away, conflicted or not on the list", () => {
    const tie = [vote("jmt", "for"), vote("t3", "against")];
    const attendance = [mt, jmt, present("t3"), present("t4")];
    const away = decide({
      attendance: [
        mt,
        jmt,
        present("t3"),
        { ...present("t4"), presence: "absent_with_leave" },
      ],
      castingVote: "for",
      chairTrusteeId: "t4",
      votes: tie,
    });
    expect(away).toMatchObject({ outcome: "failed", usedCastingVote: false });
    expect(away.reason).toContain("isn't counted present");
    const conflicted = decide({
      attendance,
      castingVote: "for",
      chairTrusteeId: "t4",
      votes: [...tie, vote("t4", "abstain", { conflict: true })],
    });
    expect(conflicted).toMatchObject({ outcome: "failed" });
    expect(conflicted.reason).toContain("declared an interest");
    expect(
      decide({
        attendance,
        castingVote: "for",
        chairTrusteeId: "stranger",
        votes: tie,
      }).outcome
    ).toBe("failed");
  });

  it("records no decision when inquorate, and ignores conflicted votes", () => {
    expect(
      decide({ attendance: [mt], rules: v1, votes: [vote("mt", "for")] })
        .outcome
    ).toBe("no_decision");
    expect(
      decide({
        attendance: [mt, jmt, present("t3")],
        votes: [vote("mt", "for"), vote("jmt", "against", { conflict: true })],
      }).outcome
    ).toBe("passed");
  });

  it("needs two-thirds of the trustees for a deed amendment", () => {
    const amendment = {
      effect: { type: "none" } as const,
      templateKey: "deed_amendment" as const,
    };
    const threeTwo = decide({
      attendance: five,
      resolution: amendment,
      rules: v1,
      votes: [
        vote("mt", "for"),
        vote("t2", "for"),
        vote("t3", "for"),
        vote("t4", "against"),
        vote("t5", "against"),
      ],
    });
    expect(threeTwo).toMatchObject({ for: 3, outcome: "failed" });
    expect(threeTwo.reason).toContain("needs 4 of the 5");
    expect(
      decide({
        attendance: five,
        resolution: amendment,
        rules: v1,
        votes: [
          vote("mt", "for"),
          vote("t2", "for"),
          vote("t3", "for"),
          vote("t4", "for"),
          vote("t5", "against"),
        ],
      }).outcome
    ).toBe("passed");
  });

  it("needs every other trustee for a removal, leaving the subject out", () => {
    const removal = {
      effect: {
        endedOn: "2026-11-01",
        hearingNote: "Heard on the charges.",
        hearingOn: "2026-10-25",
        trusteeId: "t5",
        type: "removal",
      } as const,
      templateKey: "removal" as const,
    };
    const others = [
      vote("mt", "for"),
      vote("t2", "for"),
      vote("t3", "for"),
      vote("t4", "for"),
    ];
    expect(
      decide({
        attendance: five,
        resolution: removal,
        rules: v1,
        votes: [...others, vote("t5", "against")],
      })
    ).toMatchObject({ against: 0, for: 4, outcome: "passed" });
    expect(
      decide({
        attendance: five,
        resolution: removal,
        rules: v1,
        votes: [
          ...others.slice(0, 3),
          vote("t4", "abstain"),
          vote("t5", "for"),
        ],
      })
    ).toMatchObject({ for: 3, outcome: "failed" });
    // Majority alone isn't enough: a sixth trustee away without written views.
    expect(
      decide({
        attendance: [
          ...five,
          { offices: [], presence: "absent", trusteeId: "t6" },
        ],
        resolution: removal,
        rules: v1,
        votes: others,
      }).outcome
    ).toBe("failed");
  });
});

describe("attendanceChanges", () => {
  it("keeps a decided item's attendance when the MT leaves before the next", () => {
    const votes = [vote("mt", "for"), vote("jmt", "for")];
    const decide = (attendance: AttendanceRow[]) =>
      itemResult({
        attendance,
        castingVote: null,
        chairTrusteeId: "mt",
        inOffice: 3,
        resolution: { effect: { type: "none" }, templateKey: "ordinary" },
        rules: v2,
        votes,
      });
    const t3: AttendanceRow = {
      offices: [],
      presence: "in_person",
      trusteeId: "t3",
    };
    const basis = { attendance: [mt, jmt, t3] };
    expect(decide(basis.attendance).outcome).toBe("passed");
    // The MT leaves after item 1: item 2 loses the quorum, item 1 doesn't.
    const final: AttendanceRow[] = [{ ...mt, presence: "absent" }, jmt, t3];
    expect(decide(final).quorum.reason).toContain("Managing Trustee");
    expect(decide(basis.attendance).outcome).toBe("passed");
    // The minutes note how item 1 differed from the attendance list.
    expect(attendanceChanges(basis, final)).toEqual([mt]);
    expect(attendanceChanges({ attendance: final }, final)).toEqual([]);
  });
});

describe("meetingClosing", () => {
  it("refuses an undecided resolution or a missing chair", () => {
    expect(
      meetingClosing({
        agenda: [{ kind: "resolution", outcome: null, resolutionId: "r1" }],
        chairTrusteeId: "mt",
      })
    ).toHaveProperty("problem");
    expect(meetingClosing({ agenda: [], chairTrusteeId: null })).toHaveProperty(
      "problem"
    );
  });

  it("hands back the resolutions the meeting couldn't decide", () => {
    expect(
      meetingClosing({
        agenda: [
          { kind: "resolution", outcome: "passed", resolutionId: "r1" },
          { kind: "resolution", outcome: "no_decision", resolutionId: "r2" },
          { kind: "resolution", outcome: "failed", resolutionId: "r3" },
          { kind: "discussion", outcome: null, resolutionId: null },
        ],
        chairTrusteeId: "mt",
      })
    ).toEqual({ released: ["r2"] });
  });
});

describe("meetingCancelling", () => {
  it("refuses once a resolution is decided", () => {
    expect(
      meetingCancelling([
        { kind: "resolution", outcome: "failed", resolutionId: "r1" },
      ])
    ).toHaveProperty("problem");
  });

  it("hands back every resolution still on the agenda", () => {
    expect(
      meetingCancelling([
        { kind: "resolution", outcome: null, resolutionId: "r1" },
        { kind: "resolution", outcome: "no_decision", resolutionId: "r2" },
        { kind: "discussion", outcome: null, resolutionId: null },
      ])
    ).toEqual({ released: ["r1", "r2"] });
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

describe("countedVotes", () => {
  it("lists the votes the tally counts, leaving out an absent trustee's choice without written views", () => {
    const attendance: AttendanceRow[] = [
      mt,
      jmt,
      { offices: [], presence: "absent", trusteeId: "t3" },
      { offices: [], presence: "absent", trusteeId: "t4" },
    ];
    const votes = [
      vote("mt", "for"),
      vote("jmt", "against"),
      vote("t3", "for", { absenteeWritten: true }),
      vote("t4", "against"),
    ];
    const resolution = {
      effect: { type: "none" } as const,
      templateKey: "ordinary" as const,
    };
    const counted = countedVotes({ attendance, resolution, rules: v2, votes });
    expect(counted.map((v) => v.trusteeId)).toEqual(["mt", "jmt", "t3"]);
    const result = itemResult({
      attendance,
      castingVote: null,
      chairTrusteeId: "mt",
      inOffice: 4,
      resolution,
      rules: v2,
      votes,
    });
    expect(result).toMatchObject({
      against: counted.filter((v) => v.choice === "against").length,
      for: counted.filter((v) => v.choice === "for").length,
    });
    expect(result).toMatchObject({ against: 1, for: 2 });
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
