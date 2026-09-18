import { describe, expect, it } from "bun:test";

import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import { renderToStaticMarkup } from "react-dom/server";

import { compileFilterQuery } from "@/components/data-table/compile-filter-query";
import { CompactTableProvider } from "@/components/data-table/data-table-compact";

import type {
  KalakritiEntryRow,
  KalakritiEntryStudent,
} from "./entry-form-dialog";
import {
  EntryCompactParticipants,
  EntryParticipantsCell,
  EntryStatusCell,
} from "./entry-status-cell";
import {
  createEntryTableFilterFields,
  getEntryTableFilterValue,
} from "./entry-table-filters";
import { resolveTransportStatusSnapshot } from "./use-transport-status-snapshot";
function student(id: string): KalakritiEntryStudent {
  return {
    id,
    humanId: `KAL-${id}`,
    name: id === "a" ? "Ananya" : "Dev",
    ageCategoryId: "age",
    ageCategory: {
      name: "Junior",
      maxCompetitionsPerCategory: 3,
      maxTotalCompetitions: 5,
    },
    gender: "female",
  };
}
const row: KalakritiEntryRow = {
  id: "entry",
  centerId: "a",
  center: { id: "a", name: "Center A" },
  participationMode: "group",
  sessionId: "division",
  members: ["a", "b", "a"].map((id) => ({
    studentId: id,
    student: student(id),
  })),
  musicFiles: [{ id: "music", fileName: "track.mp3" }],
  session: {
    id: "division",
    competitionSessionId: "actual-session",
    ageCategoryId: "age",
    ageCategory: { name: "Junior" },
    competition: {
      id: "competition",
      name: "Dance",
      category: { name: "Arts" },
      competitionCategoryId: "arts",
      genderEligibility: "both",
      maximumGroupSize: 5,
      minimumGroupSize: 2,
      participationMode: "group",
    },
    startAt: Date.UTC(2026, 8, 9),
    endAt: Date.UTC(2026, 8, 9, 1),
    venue: { name: "Hall" },
  },
};
const present = new Map([
  ["a", "Present"],
  ["b", "Not present"],
]);
const attended = new Map([
  ["actual-session:a", "Attended"],
  ["actual-session:b", "Not attended"],
]);
describe("Entry Present and Attended cells", () => {
  it.each(["present", "attended"] as const)(
    "renders accessible colored member icons and unique %s counts",
    (mode) => {
      const html = renderToStaticMarkup(
        <EntryStatusCell
          entry={row}
          mode={mode}
          labels={mode === "present" ? present : attended}
        />
      );
      expect(html).toContain(`1 / 2 ${mode}`);
      expect(html).toContain(
        'class="inline-flex text-green-600 dark:text-green-400"'
      );
      expect(html).toContain(
        'class="inline-flex text-red-600 dark:text-red-400"'
      );
      expect(html).toContain(
        `aria-label="Ananya: ${mode === "present" ? "Present" : "Attended"}"`
      );
      expect(html).toContain(
        `aria-label="Dev: ${mode === "present" ? "Not present" : "Not attended"}"`
      );
      expect(html.match(/role="img"/g)).toHaveLength(2);
    }
  );
  it("renders no negative icons before an authoritative snapshot", () => {
    const html = renderToStaticMarkup(
      <EntryStatusCell entry={row} mode="attended" labels={undefined} />
    );
    expect(html).toContain("Checking attendance");
    expect(html).not.toContain("text-red-600");
  });
  it("puts present and attended icons on each compact student line", () => {
    const group = renderToStaticMarkup(
      <EntryCompactParticipants
        attended={attended}
        entry={row}
        present={present}
      />
    );
    expect(group).toContain("Ananya");
    expect(group).toContain("Dev");
    expect(group).toContain('aria-label="Ananya: Present"');
    expect(group).toContain('aria-label="Ananya: Attended"');
    expect(group).toContain('aria-label="Dev: Not present"');
    expect(group).toContain('aria-label="Dev: Not attended"');
    expect(group.match(/role="img"/g)).toHaveLength(4);
    const individual = renderToStaticMarkup(
      <EntryCompactParticipants
        attended={attended}
        entry={{
          ...row,
          participationMode: "individual",
          members: [row.members[0]!],
        }}
        present={present}
      />
    );
    expect(individual).toContain("Ananya");
    expect(individual).not.toContain("Dev");
    expect(individual.match(/role="img"/g)).toHaveLength(2);
    expect(individual).toContain(">Present</span>");
    expect(individual).toContain(">Attended</span>");
  });
  it("renders one participant name node outside compact layout", () => {
    const html = renderToStaticMarkup(
      <CompactTableProvider compact={false}>
        <EntryParticipantsCell
          attended={attended}
          entry={{
            ...row,
            participationMode: "individual",
            members: [row.members[0]!],
          }}
          present={present}
        />
      </CompactTableProvider>
    );
    expect(html.match(/>Ananya</g)).toHaveLength(1);
    expect(html).not.toContain(">Present</span>");
    expect(html).not.toContain("min-w-0 truncate");
  });
  it("renders compact present and attended labels only in compact layout", () => {
    const html = renderToStaticMarkup(
      <CompactTableProvider compact={true}>
        <EntryParticipantsCell
          attended={attended}
          entry={row}
          present={present}
        />
      </CompactTableProvider>
    );
    expect(html.match(/>Ananya</g)).toHaveLength(1);
    expect(html).toContain(">Present</span>");
    expect(html).toContain(">Attended</span>");
  });
  it("does not reuse attendance from another actual session or a Division ID", () => {
    expect(
      getEntryTableFilterValue(
        row,
        ["attended"],
        present,
        new Map([
          ["division:a", "Attended"],
          ["other:b", "Attended"],
        ])
      )
    ).toBe("checking");
  });
});
describe("Entry detail filters", () => {
  it("covers visible data columns without inventing control filters", () => {
    expect(
      createEntryTableFilterFields([row], false, true).map((field) => field.id)
    ).toEqual([
      "center",
      "present",
      "attended",
      "studentId",
      "student",
      "music",
    ]);
    expect(
      createEntryTableFilterFields([row], false, true, true).map(
        (field) => field.id
      )
    ).toContain("next");
    expect(
      createEntryTableFilterFields([row], true, false).map((field) => field.id)
    ).toContain("competition");
    expect(
      createEntryTableFilterFields([row], false, false).map((field) => field.id)
    ).not.toContain("music");
  });
  it("does not offer transient loading as an attendance filter choice", () => {
    for (const field of createEntryTableFilterFields([row], false, true).filter(
      (item) => item.id === "present" || item.id === "attended"
    )) {
      expect(field.options?.map((option) => option.value)).toEqual([
        "all",
        "partial",
        "none",
      ]);
    }
  });
  it("uses array rules correctly for the single Center of each Entry", () => {
    const matches = (value: string[]) =>
      compileFilterQuery(
        createFilterQuery([
          createFilterRule({
            id: "center-filter",
            path: ["center"],
            operator: "is_any_of",
            value,
          }),
        ]),
        (entry: KalakritiEntryRow, path) =>
          getEntryTableFilterValue(entry, path, present, attended)
      )(row);
    expect(matches(["Center A", "Center B"])).toBe(true);
    expect(matches(["Center B"])).toBe(false);
  });
  it("exposes partial/all/none states using unique members, with checking kept separate", () => {
    expect(getEntryTableFilterValue(row, ["present"], present, attended)).toBe(
      "partial"
    );
    expect(
      getEntryTableFilterValue(
        row,
        ["present"],
        new Map([
          ["a", "Present"],
          ["b", "Present"],
        ]),
        attended
      )
    ).toBe("all");
    expect(
      getEntryTableFilterValue(
        row,
        ["present"],
        new Map([
          ["a", "Not present"],
          ["b", "Not present"],
        ]),
        attended
      )
    ).toBe("none");
    expect(
      getEntryTableFilterValue(row, ["present"], undefined, attended)
    ).toBe("checking");
  });
  it("filters from retained complete labels during later synchronization gaps", () => {
    const retained = resolveTransportStatusSnapshot(
      { scopeKey: "edition", labels: present },
      { scopeKey: "edition", labels: new Map() },
      false
    );
    expect(
      getEntryTableFilterValue(row, ["present"], retained?.labels, attended)
    ).toBe("partial");
  });
  it("supplies meaningful name, ID, participation, date, venue and music values", () => {
    for (const [key, value] of [
      ["studentId", "KAL-a KAL-b KAL-a"],
      ["student", "Ananya Dev Ananya"],
      ["participationMode", "group"],
      ["ageCategory", "Junior"],
      ["session", Date.UTC(2026, 8, 9)],
      ["venue", "Hall"],
      ["music", 1],
    ] as const)
      expect(getEntryTableFilterValue(row, [key], present, attended)).toBe(
        value
      );
    expect(getEntryTableFilterValue(row, ["next"], present, attended)).toBe(
      "none"
    );
    expect(
      getEntryTableFilterValue(
        row,
        ["next"],
        present,
        attended,
        new Map([["entry", { kind: "immediate" }]])
      )
    ).toBe("immediate");
  });
});
