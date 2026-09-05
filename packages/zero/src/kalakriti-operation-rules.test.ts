import { describe, expect, it } from "bun:test";

import {
  assertCanRecordOperation,
  type KalakritiOperationRecord,
} from "./kalakriti-operation-rules";
const pickup: KalakritiOperationRecord = {
  competitionSessionId: null,
  editionId: "edition",
  id: "pickup",
  membershipId: null,
  operationId: "pickup",
  studentId: "student",
  supersededByOperationId: null,
  type: "pickup",
};
describe("Kalakriti operation rules", () => {
  it("requires exactly one subject and matches operation types", () => {
    expect(() => assertCanRecordOperation([], "pickup", {})).toThrow(
      "Exactly one"
    );
    expect(() =>
      assertCanRecordOperation([], "pickup", { membershipId: "volunteer" })
    ).toThrow("Student subject");
    expect(() =>
      assertCanRecordOperation([], "volunteer_check_in", {
        studentId: "student",
      })
    ).toThrow("volunteer subject");
  });
  it("enforces transport order and ignores superseded prerequisites", () => {
    expect(() =>
      assertCanRecordOperation([], "venue_departure", { studentId: "student" })
    ).toThrow("Pickup");
    expect(() =>
      assertCanRecordOperation([pickup], "venue_departure", {
        studentId: "student",
      })
    ).not.toThrow();
    expect(() =>
      assertCanRecordOperation([pickup], "drop_off", { studentId: "student" })
    ).toThrow("Venue departure");
    expect(() =>
      assertCanRecordOperation(
        [{ ...pickup, type: "venue_departure" }],
        "drop_off",
        { studentId: "student" }
      )
    ).not.toThrow();
    expect(() =>
      assertCanRecordOperation(
        [{ ...pickup, supersededByOperationId: "replacement" }],
        "breakfast",
        { studentId: "student" }
      )
    ).toThrow("Pickup");
  });
  it("requires volunteer check-in before either meal", () => {
    for (const type of ["breakfast", "lunch"] as const) {
      expect(() =>
        assertCanRecordOperation([], type, { membershipId: "volunteer" })
      ).toThrow("Check-in");
      expect(() =>
        assertCanRecordOperation(
          [
            {
              ...pickup,
              studentId: null,
              membershipId: "volunteer",
              type: "volunteer_check_in",
            },
          ],
          type,
          { membershipId: "volunteer" }
        )
      ).not.toThrow();
    }
  });
  it("requires attendance session and pickup, disallowing session on other actions", () => {
    expect(() =>
      assertCanRecordOperation([pickup], "competition_attendance", {
        studentId: "student",
      })
    ).toThrow("session");
    expect(() =>
      assertCanRecordOperation(
        [],
        "competition_attendance",
        { studentId: "student" },
        "session"
      )
    ).toThrow("Pickup");
    expect(() =>
      assertCanRecordOperation(
        [pickup],
        "competition_attendance",
        { studentId: "student" },
        "session"
      )
    ).not.toThrow();
    expect(() =>
      assertCanRecordOperation(
        [],
        "pickup",
        { studentId: "student" },
        "session"
      )
    ).toThrow("only allowed");
  });
});
