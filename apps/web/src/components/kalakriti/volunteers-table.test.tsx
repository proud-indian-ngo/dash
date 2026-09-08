import { describe, expect, it, mock } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import type {
  VolunteerAssignmentItem,
  VolunteerRosterItem,
} from "./volunteers-table";

interface CapturedTable {
  defaultColumnVisibility: Record<string, boolean>;
  columns: {
    id: string;
    accessorFn?: (row: VolunteerRosterItem) => unknown;
    meta?: { headerTitle?: string; skeleton?: unknown };
  }[];
  searchFn: (row: VolunteerRosterItem, query: string) => boolean;
  onRowClick: (row: VolunteerRosterItem) => void;
}
let table: CapturedTable;
mock.module("@/components/data-table/data-table-wrapper", () => ({
  DataTableWrapper: (props: CapturedTable) => {
    table = props;
    return null;
  },
}));
const { VolunteersTable } = await import("./volunteers-table");

const row: VolunteerRosterItem = {
  id: "membership",
  userId: "user",
  userRole: "volunteer",
  snapshotName: "Volunteer",
  snapshotEmail: null,
  snapshotPhone: null,
  registrationGroup: "Weekend Team",
  assignments: [],
};
function assignment(
  id: string,
  scope: Partial<VolunteerAssignmentItem>
): VolunteerAssignmentItem {
  return {
    id,
    centerId: null,
    competitionCategoryId: null,
    competitionId: null,
    isPrimary: false,
    responsibility: "liaison_volunteer",
    scopeName: null,
    ...scope,
  };
}
function setup() {
  const onView = mock(() => undefined);
  renderToStaticMarkup(
    <VolunteersTable
      actorResponsibilities={[]}
      data={[row]}
      isGlobalAdmin={true}
      isLoading={false}
      onAssignRole={() => undefined}
      onRemove={() => undefined}
      onRemoveFromEdition={() => undefined}
      onView={onView}
    />
  );
  return onView;
}
function value(id: string, item = row) {
  return table.columns.find((column) => column.id === id)?.accessorFn?.(item);
}

describe("Volunteer table scope and group columns", () => {
  it("hides the new columns by default while keeping them available", () => {
    setup();
    expect(table.defaultColumnVisibility).toEqual({
      centers: false,
      categories: false,
      competitions: false,
      primary: false,
      registrationGroup: false,
    });
    for (const id of Object.keys(table.defaultColumnVisibility)) {
      expect(table.columns.some((column) => column.id === id)).toBe(true);
    }
  });
  it("deduplicates and sorts named scopes without exposing missing IDs", () => {
    setup();
    const scoped = {
      ...row,
      assignments: [
        assignment("a", { centerId: "z", scopeName: "Zebra" }),
        assignment("b", { centerId: "a", scopeName: "Alpha" }),
        assignment("c", { centerId: "a", scopeName: "Alpha" }),
        assignment("d", {
          competitionCategoryId: "category",
          scopeName: "Music",
        }),
        assignment("e", { competitionId: "secret-uuid", scopeName: null }),
      ],
    };
    expect(value("centers", scoped)).toBe("Alpha, Zebra");
    expect(value("categories", scoped)).toBe("Music");
    expect(value("competitions", scoped)).toBe("Not available");
    expect(value("centers")).toBe("—");
  });
  it("shows group and primary state, supports group search, and preserves row clicks", () => {
    const onView = setup();
    expect(value("registrationGroup")).toBe("Weekend Team");
    expect(
      value("registrationGroup", { ...row, registrationGroup: null })
    ).toBe("—");
    expect(value("primary")).toBe("Not primary");
    expect(
      value("primary", {
        ...row,
        assignments: [assignment("primary", { isPrimary: true })],
      })
    ).toBe("Primary");
    expect(table.searchFn(row, " WEEKEND ")).toBe(true);
    table.onRowClick(row);
    expect(onView).toHaveBeenCalledWith(row);
    for (const id of [
      "registrationGroup",
      "centers",
      "categories",
      "competitions",
      "primary",
    ]) {
      const column = table.columns.find((item) => item.id === id);
      expect(column?.meta?.headerTitle).toBeTruthy();
      expect(column?.meta?.skeleton).toBeTruthy();
    }
  });
});
