import { expect, it, mock } from "bun:test";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { StudentTableRow } from "./student-table";
interface Captured {
  columns: {
    id?: string;
    accessorFn?: (row: StudentTableRow) => unknown;
    cell?: (ctx: { row: { original: StudentTableRow } }) => ReactElement<{
      canManage: boolean;
      entryRegistrationEnabled: boolean;
      student: StudentTableRow;
    }>;
  }[];
  searchFn: (row: StudentTableRow, query: string) => boolean;
  filter: { getValue: (row: StudentTableRow, path: string[]) => unknown };
}
let captured: Captured;
mock.module("@/components/data-table/data-table-wrapper", () => ({
  DataTableWrapper: (props: Captured) => {
    captured = props;
    return null;
  },
}));
const { StudentTable } = await import("./student-table");
const noop = () => undefined;
function row(centerId: string): StudentTableRow {
  return {
    id: centerId,
    centerId,
    center: { id: centerId, name: `Center ${centerId}` },
    humanId: `KAL-${centerId}`,
    name: `Student ${centerId}`,
    ageCategoryId: "age",
    derivedAgeCategoryId: "age",
    ageCategoryOverrideReason: null,
    dateOfBirth: 0,
    gender: "female",
  };
}
it("derives each row action from its actual Center rather than the global create permission", () => {
  const rows = [row("a"), row("b"), row("missing")];
  renderToStaticMarkup(
    <StudentTable
      canManage={true}
      centerPermissions={{
        a: { canManage: false, entryRegistrationEnabled: false },
        b: { canManage: true, entryRegistrationEnabled: true },
      }}
      data={rows}
      entryRegistrationEnabled={true}
      isLoading={false}
      statusSnapshotComplete={true}
      statusSnapshotKey="edition:directory"
      onDelete={noop}
      onEdit={noop}
      onView={noop}
      onRegister={noop}
    />
  );
  const actions = captured.columns.find((column) => column.id === "actions");
  const a = actions?.cell?.({ row: { original: rows[0]! } });
  const b = actions?.cell?.({ row: { original: rows[1]! } });
  const missing = actions?.cell?.({ row: { original: rows[2]! } });
  expect(a?.props.canManage).toBe(false);
  expect(a?.props.entryRegistrationEnabled).toBe(false);
  expect(b?.props.canManage).toBe(true);
  expect(b?.props.student.centerId).toBe("b");
  expect(missing?.props.canManage).toBe(false);
  expect(
    captured.columns
      .find((column) => column.id === "center")
      ?.accessorFn?.(rows[1]!)
  ).toBe("Center b");
  expect(captured.filter.getValue(rows[1]!, ["center"])).toBe("b");
  expect(captured.searchFn(rows[1]!, "Center b")).toBe(true);
});
