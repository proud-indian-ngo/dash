import { describe, expect, it, mock } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { attendeeFormSchema } from "./attendee-form-dialog";
import type { AttendeeRow } from "./attendees-table";

interface CapturedAttendees {
  columns: {
    id?: string;
    meta?: { compact?: string };
  }[];
}
let captured: CapturedAttendees;
mock.module("@/components/data-table/data-table-wrapper", () => ({
  DataTableWrapper: (props: CapturedAttendees) => {
    captured = props;
    return null;
  },
}));
const { attendeeStatus, AttendeeStatus, AttendeesTable } =
  await import("./attendees-table");
const attendee: AttendeeRow = {
  id: "attendee",
  name: "Judge",
  kind: "judge",
  humanId: "KALJ-2026-0001",
  phone: "+919876543210",
  email: null,
  judgeAssignments: [],
  operations: [
    { type: "attendee_check_in", supersededByOperationId: null },
    { type: "breakfast", supersededByOperationId: "undo" },
  ],
};
describe("attendee UI", () => {
  it("requires name and phone but not email or login credentials", () => {
    expect(
      attendeeFormSchema.safeParse({
        name: "Guest",
        phone: "+919876543210",
        email: "",
      }).success
    ).toBe(true);
    for (const value of [
      { name: " ", phone: "123", email: "" },
      { name: "Guest", phone: "", email: "" },
      { name: "Guest", phone: "123", email: "invalid" },
    ])
      expect(attendeeFormSchema.safeParse(value).success).toBe(false);
  });
  it.each(["guest", "judge"] as const)(
    "uses green checks and red crosses for %s statuses",
    (kind) => {
      const row = { ...attendee, kind };
      for (const type of ["attendee_check_in", "breakfast", "lunch"]) {
        const positive = renderToStaticMarkup(
          <AttendeeStatus
            row={{
              ...row,
              operations: [{ type, supersededByOperationId: null }],
            }}
            type={type}
            ready
          />
        );
        expect(positive).toContain("text-green-600 dark:text-green-400");
        expect(positive).toContain("<svg");
        expect(positive).toContain(
          `aria-label="${type === "attendee_check_in" ? "Checked in" : "Served"}"`
        );
        const negative = renderToStaticMarkup(
          <AttendeeStatus row={{ ...row, operations: [] }} type={type} ready />
        );
        expect(negative).toContain("text-red-600 dark:text-red-400");
        expect(negative).toContain("<svg");
        expect(negative).toContain(
          `aria-label="${type === "attendee_check_in" ? "Not checked in" : "Not served"}"`
        );
      }
    }
  );
  it("shows only effective marks and never a false negative before the snapshot", () => {
    expect(attendeeStatus(attendee, "attendee_check_in")).toBe(true);
    expect(attendeeStatus(attendee, "breakfast")).toBe(false);
    expect(
      renderToStaticMarkup(
        <AttendeeStatus row={attendee} type="attendee_check_in" ready />
      )
    ).toContain('aria-label="Checked in"');
    expect(
      renderToStaticMarkup(
        <AttendeeStatus row={attendee} type="breakfast" ready />
      )
    ).toContain('aria-label="Not served"');
    expect(
      renderToStaticMarkup(
        <AttendeeStatus row={attendee} type="breakfast" ready={false} />
      )
    ).not.toContain('role="img"');
  });
  it.each(["guest", "judge"] as const)(
    "stacks checked-in status instead of yearly ID for %s compact rows",
    (kind) => {
      const noop = () => undefined;
      renderToStaticMarkup(
        <AttendeesTable
          canManage={false}
          data={[{ ...attendee, kind }]}
          isLoading={false}
          kind={kind}
          onAssign={noop}
          onEdit={noop}
          onRemove={noop}
          onView={noop}
          statusReady
          toolbarActions={null}
        />
      );
      expect(
        captured.columns.find((column) => column.id === "humanId")?.meta
          ?.compact
      ).toBeUndefined();
      expect(
        captured.columns.find((column) => column.id === "attendee_check_in")
          ?.meta?.compact
      ).toBe("primary");
      expect(
        captured.columns.find((column) => column.id === "competitions")?.meta
          ?.compact
      ).toBe(kind === "judge" ? "primary" : undefined);
    }
  );
});
