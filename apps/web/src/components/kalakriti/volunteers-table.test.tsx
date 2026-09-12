import { describe, expect, it, mock } from "bun:test";

import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import { renderToStaticMarkup } from "react-dom/server";

import type { VolunteerRosterItem } from "./volunteers-table";

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
let table: CapturedTable | undefined;
let query = createFilterQuery();
mock.module("@/components/data-table/use-data-table-filters", () => ({
  useDataTableFilters: () => ({ query, setQuery: () => undefined }),
}));
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
  assignments: [
    {
      id: "assignment",
      centerId: "center",
      competitionCategoryId: null,
      competitionId: null,
      isPrimary: true,
      responsibility: "liaison_volunteer",
      scopeName: "North",
    },
  ],
};
function setup() {
  table = undefined;
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
describe("Volunteer table simplified columns", () => {
  it("removes scope and primary columns entirely, including visibility choices", () => {
    query = createFilterQuery();
    setup();
    expect(table?.defaultColumnVisibility).toEqual({
      registrationGroup: false,
    });
    for (const id of ["centers", "categories", "competitions", "primary"])
      expect(table?.columns.some((column) => column.id === id)).toBe(false);
    for (const id of [
      "snapshotName",
      "humanId",
      "snapshotEmail",
      "snapshotPhone",
      "checkInStatus",
      "roles",
      "registrationGroup",
      "actions",
    ])
      expect(table?.columns.some((column) => column.id === id)).toBe(true);
  });
  it("preserves Roles scope/primary descriptions, group search and detail clicks", () => {
    query = createFilterQuery();
    const onView = setup();
    const roles = table?.columns
      .find((column) => column.id === "roles")
      ?.accessorFn?.(row);
    expect(roles).toContain("North");
    expect(roles).toContain("Primary");
    expect(table?.searchFn(row, " WEEKEND ")).toBe(true);
    table?.onRowClick(row);
    expect(onView).toHaveBeenCalledWith(row);
  });
  it("does not render narrowed rows while obsolete saved filters are being removed", () => {
    query = createFilterQuery([
      createFilterRule({
        id: "old",
        path: ["centers"],
        operator: "has_any_of",
        value: ["old-center"],
      }),
    ]);
    setup();
    expect(table).toBeUndefined();
    query = createFilterQuery();
  });
});
