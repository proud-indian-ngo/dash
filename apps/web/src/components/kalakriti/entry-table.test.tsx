import { expect, it, mock } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { KalakritiEntryRow } from "./entry-form-dialog";

interface Captured {
  columns: { id?: string }[];
  data: KalakritiEntryRow[];
  filter?: { fields: { id: string }[] };
}

let captured: Captured;

mock.module("@/components/data-table/data-table-wrapper", () => ({
  DataTableWrapper: (props: Captured) => {
    captured = props;
    return null;
  },
}));
mock.module("@/components/data-table/use-data-table-filters", () => ({
  useDataTableFilters: () => ({
    isEmpty: true,
    query: { type: "group", rules: [] },
    setQuery: () => undefined,
  }),
}));

const { EntryTable } = await import("./entry-table");

function row(id: string, name: string): KalakritiEntryRow {
  return {
    id,
    centerId: "center",
    center: { id: "center", name: "North" },
    participationMode: "individual",
    sessionId: "division",
    members: [
      {
        studentId: id,
        student: {
          id,
          humanId: `KAL-${id}`,
          name,
          ageCategoryId: "age",
          ageCategory: {
            name: "Junior",
            maxCompetitionsPerCategory: 3,
            maxTotalCompetitions: 5,
          },
          gender: "female",
        },
      },
    ],
    musicFiles: [],
    session: {
      id: "division",
      competitionSessionId: "session",
      ageCategoryId: "age",
      ageCategory: { name: "Junior" },
      competition: {
        id: "competition",
        name: "Solo Dance",
        category: { name: "Stage" },
        competitionCategoryId: "stage",
        genderEligibility: "both",
        maximumGroupSize: 1,
        minimumGroupSize: 1,
        participationMode: "individual",
        sequentialPerformances: true,
      },
      startAt: 100,
      endAt: 200,
      venue: { name: "Hall" },
    },
  };
}

const permissions = {
  edit: false,
  register: false,
  remove: false,
  uploadMusic: false,
};

function renderSession(
  data: KalakritiEntryRow[],
  nextByEntryId?: Map<string, { kind: string }>
) {
  const noop = () => undefined;
  renderToStaticMarkup(
    <EntryTable
      activeSessionIds={[]}
      data={data}
      editionId="edition"
      isLoading={false}
      nextByEntryId={nextByEntryId as never}
      onEdit={noop}
      onRegister={noop}
      onRemove={noop}
      permissions={permissions}
      snapshotReady
      variant="session"
    />
  );
}

it("shows Next and keeps the back-to-back Student first on sequential sessions", () => {
  const later = row("later", "Zara");
  const immediate = row("now", "Bina");
  renderSession(
    [immediate, later],
    new Map([
      ["now", { kind: "immediate" }],
      ["later", { kind: "later" }],
    ])
  );
  expect(captured.columns.some((column) => column.id === "next")).toBe(true);
  expect(captured.filter?.fields.some((field) => field.id === "next")).toBe(
    true
  );
  expect(captured.data.map((entry) => entry.id)).toEqual(["now", "later"]);
});

it("omits Next on simultaneous sessions", () => {
  renderSession([row("paint", "Asha")]);
  expect(captured.columns.some((column) => column.id === "next")).toBe(false);
  expect(captured.filter?.fields.some((field) => field.id === "next")).toBe(
    false
  );
});
