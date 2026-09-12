import { describe, expect, it, mock } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { CenterTableRow } from "./centers-table";
import type { StudentTableRow } from "./student-table";

interface CapturedTable<T> {
  isLoading: boolean;
  columns: {
    id?: string;
    accessorFn?: (row: T) => unknown;
    enableSorting?: boolean;
    meta?: { headerTitle?: string; skeleton?: unknown };
  }[];
  searchFn: (row: T, query: string) => boolean;
  filter: {
    getValue: (row: T, path: string[]) => unknown;
    fields: { id: string }[];
  };
}
let captured: unknown;
mock.module("@/components/data-table/data-table-wrapper", () => ({
  DataTableWrapper: (props: unknown) => {
    captured = props;
    return null;
  },
}));
const { StudentTable } = await import("./student-table");
const { CentersTable } = await import("./centers-table");
const noop = () => undefined;
const student: StudentTableRow = {
  id: "student",
  name: "Student",
  humanId: "KAL-2027-0001",
  ageCategoryId: "age",
  derivedAgeCategoryId: "age",
  ageCategoryOverrideReason: null,
  centerId: "center",
  dateOfBirth: 0,
  gender: "female",
  operations: [],
};
const center: CenterTableRow = {
  id: "center",
  name: "Center",
  retiredAt: null,
  studentRegistrationEnabled: false,
  competitionEntryRegistrationEnabled: false,
  guardianCount: null,
  liaisonCount: null,
  scanStages: [],
};
function renderStudent(row: StudentTableRow, complete = true) {
  renderToStaticMarkup(
    <StudentTable
      data={[row]}
      canManage={false}
      statusSnapshotComplete={complete}
      statusSnapshotKey="edition:center"
      entryRegistrationEnabled={false}
      isLoading={false}
      onDelete={noop}
      onEdit={noop}
      onRegister={noop}
      onView={noop}
    />
  );
  return captured as CapturedTable<StudentTableRow>;
}
function renderCenter(row: CenterTableRow, complete = true) {
  renderToStaticMarkup(
    <CentersTable
      data={[row]}
      canConfigureCenters={false}
      statusSnapshotComplete={complete}
      statusSnapshotKey="edition"
      canManageRegistrationControls={false}
      emptyMessage="No Centers"
      isLoading={false}
      onDelete={noop}
      onEdit={noop}
      onRegistrationControls={noop}
      onRetire={noop}
      onView={noop}
    />
  );
  return captured as CapturedTable<CenterTableRow>;
}

describe("read-only transport status columns", () => {
  it("does not mislabel partial cached rows as awaiting pickup or skeletonize the whole table", () => {
    const studentTable = renderStudent(student, false);
    const centerTable = renderCenter(center, false);
    expect(
      studentTable.columns
        .find((entry) => entry.id === "transportStatus")
        ?.accessorFn?.(student)
    ).toBeUndefined();
    expect(
      centerTable.columns
        .find((entry) => entry.id === "transportStatus")
        ?.accessorFn?.(center)
    ).toBeUndefined();
    for (const table of [studentTable, centerTable]) {
      expect(table.isLoading).toBe(false);
      expect(
        table.columns.find((entry) => entry.id === "transportStatus")
          ?.enableSorting
      ).toBe(false);
    }
    expect(
      studentTable.filter.fields.some((field) => field.id === "transportStatus")
    ).toBe(true);
    expect(
      studentTable.filter.getValue(student, ["transportStatus"])
    ).toBeUndefined();
    expect(
      centerTable.filter.fields.some((field) => field.id === "transportStatus")
    ).toBe(false);
  });
  it("shows live Student marks independently of Center finalization without changing existing filters/search", () => {
    const initial = renderStudent(student);
    const column = initial.columns.find(
      (entry) => entry.id === "transportStatus"
    );
    expect(column?.meta?.headerTitle).toBe("Transport status");
    expect(column?.meta?.skeleton).toBeDefined();
    expect(column?.accessorFn?.(student)).toBe("Awaiting pickup");
    const pickedUp: StudentTableRow = {
      ...student,
      operations: [{ type: "pickup", supersededByOperationId: null }],
    };
    const updated = renderStudent(pickedUp);
    expect(
      updated.columns
        .find((entry) => entry.id === "transportStatus")
        ?.accessorFn?.(pickedUp)
    ).toBe("Picked up");
    expect(
      updated.filter.fields.some((field) => field.id === "transportStatus")
    ).toBe(true);
    expect(updated.filter.getValue(pickedUp, ["transportStatus"])).toBe(
      "Picked up"
    );
    expect(updated.searchFn(pickedUp, "picked up")).toBe(false);
    expect(updated.searchFn(pickedUp, "student")).toBe(true);
    expect(updated.isLoading).toBe(false);
  });

  it("preserves Center Active/Retired and advances transport status only for finalized stages", () => {
    const initial = renderCenter(center);
    expect(
      initial.columns
        .find((entry) => entry.id === "status")
        ?.accessorFn?.(center)
    ).toBe("Active");
    expect(
      initial.columns.find((entry) => entry.id === "transportStatus")?.meta
        ?.headerTitle
    ).toBe("Transport status");
    const open: CenterTableRow = {
      ...center,
      scanStages: [{ stage: "pickup", finalizedAt: null }],
    };
    expect(
      renderCenter(open)
        .columns.find((entry) => entry.id === "transportStatus")
        ?.accessorFn?.(open)
    ).toBe("Awaiting pickup");
    const finished: CenterTableRow = {
      ...center,
      scanStages: [{ stage: "pickup", finalizedAt: 1 }],
    };
    const updated = renderCenter(finished);
    expect(
      updated.columns
        .find((entry) => entry.id === "transportStatus")
        ?.accessorFn?.(finished)
    ).toBe("Heading to event");
    expect(
      updated.filter.fields.some((field) => field.id === "transportStatus")
    ).toBe(false);
    expect(updated.searchFn(finished, "heading to event")).toBe(false);
    expect(updated.searchFn(finished, "active")).toBe(true);
    expect(updated.isLoading).toBe(false);
  });
});
