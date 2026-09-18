import { expect, it, mock } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { CompetitionTableRow } from "./competition-config-types";

interface Captured {
  compactOnMobile?: boolean;
  columns: { id?: string; accessorKey?: string; meta?: { compact?: string } }[];
}
let captured: Captured;
mock.module("@/components/data-table/data-table-wrapper", () => ({
  DataTableWrapper: (props: Captured) => {
    captured = props;
    return null;
  },
}));
const { CompetitionsTable } = await import("./competitions-table");
const row = {
  id: "competition",
  name: "Clay Modelling",
  competitionCategoryId: "arts",
  participationMode: "individual",
  genderEligibility: "female",
  minimumGroupSize: 1,
  maximumGroupSize: 1,
  musicUploadEnabled: false,
  cancelledAt: null,
  retiredAt: null,
  categoryName: "Visual Arts",
  entryCount: 1,
  participantCount: 4,
  divisions: [],
} as unknown as CompetitionTableRow;
it("shows participant counts on the compact competition row", () => {
  const noop = () => undefined;
  renderToStaticMarkup(
    <CompetitionsTable
      canEdit={false}
      canManageCancellations={false}
      canManageStructure={false}
      data={[row]}
      isLoading={false}
      onDelete={noop}
      onDetails={noop}
      onEdit={noop}
      onSetState={noop}
      onView={noop}
    />
  );
  expect(captured.compactOnMobile).toBe(true);
  expect(
    captured.columns.find((column) => column.accessorKey === "participantCount")
      ?.meta?.compact
  ).toBe("trailing");
  expect(
    captured.columns.find((column) => column.id === "status")?.meta?.compact
  ).toBe("primary");
});
