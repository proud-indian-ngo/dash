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
  for (const attendeeKind of ["guest", "judge"] as const) {
    const subject = { attendeeId: "attendee", attendeeKind };
    const checkIn: KalakritiOperationRecord = {
      ...pickup,
      studentId: null,
      attendeeId: "attendee",
      type: "attendee_check_in",
    };
    it(`requires effective ${attendeeKind} check-in independently of membership history`, () => {
      expect(() =>
        assertCanRecordOperation([], "attendee_check_in", subject)
      ).not.toThrow();
      for (const type of ["breakfast", "lunch"] as const) {
        expect(() =>
          assertCanRecordOperation([checkIn], type, subject)
        ).not.toThrow();
        for (const operations of [
          [],
          [{ ...checkIn, supersededByOperationId: "correction" }],
          [{ ...checkIn, attendeeId: "other" }],
          [
            {
              ...checkIn,
              attendeeId: null,
              membershipId: "attendee",
              type: "volunteer_check_in" as const,
            },
          ],
        ]) {
          expect(() =>
            assertCanRecordOperation(operations, type, subject)
          ).toThrow("Check-in");
        }
      }
    });
    it(`rejects ${attendeeKind} transport, attendance, and mixed subject IDs`, () => {
      for (const type of [
        "pickup",
        "venue_arrival",
        "venue_departure",
        "drop_off",
        "competition_attendance",
      ] as const) {
        expect(() =>
          assertCanRecordOperation([checkIn], type, subject)
        ).toThrow("Student subject");
      }
      expect(() =>
        assertCanRecordOperation([], "volunteer_check_in", subject)
      ).toThrow("volunteer subject");
      expect(() =>
        assertCanRecordOperation([], "attendee_check_in", {
          membershipId: "attendee",
        })
      ).toThrow("attendee subject");
      for (const extra of [
        { studentId: "student" },
        { membershipId: "member" },
      ]) {
        expect(() =>
          assertCanRecordOperation([], "breakfast", { ...subject, ...extra })
        ).toThrow("Exactly one");
      }
      expect(() =>
        assertCanRecordOperation([], "attendee_check_in", subject, "session")
      ).toThrow("only allowed for attendance");
    });
  }

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
    ).toThrow("Venue arrival");
    expect(() =>
      assertCanRecordOperation([pickup], "venue_arrival", {
        studentId: "student",
      })
    ).not.toThrow();
    expect(() =>
      assertCanRecordOperation([], "venue_arrival", { studentId: "student" })
    ).toThrow("Pickup");
    expect(() =>
      assertCanRecordOperation(
        [pickup, { ...pickup, type: "venue_arrival" }],
        "venue_departure",
        { studentId: "student" }
      )
    ).not.toThrow();
    expect(() =>
      assertCanRecordOperation(
        [
          pickup,
          {
            ...pickup,
            type: "venue_arrival",
            supersededByOperationId: "replacement",
          },
        ],
        "venue_departure",
        { studentId: "student" }
      )
    ).toThrow("Venue arrival");
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
