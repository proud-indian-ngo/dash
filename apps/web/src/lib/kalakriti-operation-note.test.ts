import { describe, expect, it } from "bun:test";

import {
  createOperationNoteLedger,
  getOperationNoteTypes,
  isOperationNoteTargetCurrent,
  makeOperationNoteAttempt,
} from "./kalakriti-operation-note";

const access = (
  responsibility: string,
  competitionId: string | null = null
) => ({
  isGlobalAdmin: false,
  lifecycle: "live",
  membership: {
    kind: "volunteer",
    assignments: [{ responsibility, competitionId }],
  },
});

describe("operation correction notes", () => {
  it("grants only current lead responsibilities, never members or liaisons", () => {
    for (const role of [
      "food_member",
      "hospitality_member",
      "competition_volunteer",
      "transport_coordinator",
      "center_liaison_lead",
      "center_liaison_member",
    ])
      expect(getOperationNoteTypes(access(role))).toEqual([]);
    expect(
      getOperationNoteTypes(access("transport_lead")).map((item) => item.value)
    ).toEqual(["pickup", "venue_arrival", "venue_departure", "drop_off"]);
    expect(
      getOperationNoteTypes(access("food_lead")).map((item) => item.value)
    ).toEqual(["breakfast", "lunch"]);
    expect(
      getOperationNoteTypes(access("hospitality_lead")).map(
        (item) => item.value
      )
    ).toEqual(["volunteer_check_in"]);
    expect(getOperationNoteTypes(access("competition_coordinator"))).toEqual(
      []
    );
    expect(
      getOperationNoteTypes(
        access("competition_coordinator", "competition")
      ).map((item) => item.value)
    ).toEqual(["competition_attendance"]);
  });
  it("fails closed outside live and for Guardian actors, while admins may annotate every forward type", () => {
    expect(
      getOperationNoteTypes({
        ...access("food_lead"),
        membership: { ...access("food_lead").membership, kind: "guardian" },
      })
    ).toEqual([]);
    expect(
      getOperationNoteTypes({
        ...access("edition_admin"),
        lifecycle: "registration_locked",
      })
    ).toEqual([]);
    expect(
      getOperationNoteTypes({ isGlobalAdmin: true, lifecycle: "archived" })
    ).toEqual([]);
    expect(getOperationNoteTypes(access("edition_admin"))).toHaveLength(8);
    expect(
      getOperationNoteTypes({ isGlobalAdmin: true, lifecycle: "live" })
    ).toHaveLength(8);
  });
  it("retains exact uncertain arguments and only permits the original target or its own revision binding", () => {
    const ledger = createOperationNoteLedger("edition:role");
    const attempt = makeOperationNoteAttempt({
      editionId: "edition",
      targetOperationId: "original",
      reason: "  Clarification  ",
      humanId: "KAL-2026-0001",
      subject: { studentId: "student" },
    });
    ledger.setAttempt(attempt);
    expect(ledger.attempt?.args).toBe(attempt.args);
    expect(attempt.args.reason).toBe("Clarification");
    expect(
      isOperationNoteTargetCurrent(
        { id: "original", supersededByOperationId: null },
        attempt
      )
    ).toBe(true);
    expect(
      isOperationNoteTargetCurrent(
        { id: "original", supersededByOperationId: attempt.args.id },
        attempt
      )
    ).toBe(true);
    expect(
      isOperationNoteTargetCurrent(
        { id: "original", supersededByOperationId: "someone-else" },
        attempt
      )
    ).toBe(false);
    expect(
      isOperationNoteTargetCurrent(
        { id: attempt.args.id, supersededByOperationId: null },
        attempt
      )
    ).toBe(false);
    expect(createOperationNoteLedger("different-scope").attempt).toBeNull();
  });
});
