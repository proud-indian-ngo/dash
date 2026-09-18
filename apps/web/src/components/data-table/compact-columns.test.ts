import { describe, expect, it } from "bun:test";

import {
  applyCompactVisibilityChange,
  COMPACT_EXPAND_COLUMN_ID,
  findExistingExpandColumnId,
  insertExpandColumn,
  overlayCompactVisibility,
  partitionCompactColumns,
  resolveCompactRole,
  stripCompactExpandId,
  visibleCollapsedIds,
  visibleStackedPrimaryIds,
  withCompactExpandOrder,
  withCompactExpandPinning,
} from "./compact-columns";

const centerColumns = [
  { id: "name" },
  { id: "status" },
  { id: "transportStatus" },
  { id: "studentRegistrationEnabled" },
  { id: "actions" },
];

describe("resolveCompactRole", () => {
  it("defaults the first data column to primary and utility columns to always", () => {
    expect(resolveCompactRole({ id: "name" }, "name")).toBe("primary");
    expect(resolveCompactRole({ id: "status" }, "name")).toBe("collapsed");
    expect(resolveCompactRole({ id: "actions" }, "name")).toBe("always");
    expect(resolveCompactRole({ id: "select" }, "name")).toBe("always");
    expect(resolveCompactRole({ id: COMPACT_EXPAND_COLUMN_ID }, "name")).toBe(
      "always"
    );
    expect(resolveCompactRole({ id: "expand" }, "name")).toBe("always");
  });

  it("honors explicit compact roles over defaults", () => {
    expect(
      resolveCompactRole({ compact: "primary", id: "status" }, "name")
    ).toBe("primary");
    expect(resolveCompactRole({ compact: "hidden", id: "name" }, "name")).toBe(
      "hidden"
    );
    expect(
      resolveCompactRole({ compact: "collapsed", id: "actions" }, "name")
    ).toBe("collapsed");
  });
});

describe("partitionCompactColumns", () => {
  it("stacks extra primaries and treats remaining data columns as collapsed", () => {
    const partition = partitionCompactColumns([
      { compact: "primary", id: "name" },
      { compact: "primary", id: "status" },
      { id: "transportStatus" },
      { id: "actions" },
    ]);
    expect(partition).toEqual({
      alwaysIds: ["actions"],
      collapsedIds: ["transportStatus"],
      firstPrimaryId: "name",
      hasCollapsed: true,
      hiddenIds: [],
      stackedPrimaryIds: ["status"],
      trailingIds: [],
    });
  });

  it("skips expand when every data column is primary or always", () => {
    const partition = partitionCompactColumns([
      { id: "name" },
      { compact: "always", id: "status" },
      { id: "actions" },
    ]);
    expect(partition.hasCollapsed).toBe(false);
    expect(partition.collapsedIds).toEqual([]);
    expect(partition.firstPrimaryId).toBe("name");
  });

  it("stacks time under action when both are primary", () => {
    expect(
      partitionCompactColumns([
        { compact: "primary", id: "createdAt" },
        { id: "actor" },
        { compact: "primary", id: "action" },
      ])
    ).toEqual({
      alwaysIds: [],
      collapsedIds: ["actor"],
      firstPrimaryId: "action",
      hasCollapsed: true,
      hiddenIds: [],
      stackedPrimaryIds: ["createdAt"],
      trailingIds: [],
    });
  });

  it("stacks extra scan fields under Participants when Center is also primary", () => {
    expect(
      partitionCompactColumns([
        { compact: "primary", id: "center" },
        { compact: "primary", id: "student" },
        { id: "venue" },
      ])
    ).toEqual({
      alwaysIds: [],
      collapsedIds: ["venue"],
      firstPrimaryId: "student",
      hasCollapsed: true,
      hiddenIds: [],
      stackedPrimaryIds: ["center"],
      trailingIds: [],
    });
  });

  it("places trailing columns beside the identity instead of stacking them", () => {
    expect(
      partitionCompactColumns([
        { compact: "primary", id: "name" },
        { compact: "primary", id: "role" },
        { compact: "trailing", id: "breakfast" },
        { compact: "trailing", id: "lunch" },
        { id: "centers" },
      ])
    ).toEqual({
      alwaysIds: [],
      collapsedIds: ["centers"],
      firstPrimaryId: "name",
      hasCollapsed: true,
      hiddenIds: [],
      stackedPrimaryIds: ["role"],
      trailingIds: ["breakfast", "lunch"],
    });
  });
});

describe("overlayCompactVisibility", () => {
  const partition = partitionCompactColumns([
    { compact: "primary", id: "name" },
    { compact: "primary", id: "status" },
    { id: "transportStatus" },
    { id: "actions" },
  ]);

  it("hides collapsed and stacked columns without mutating persisted visibility", () => {
    const persisted = Object.freeze({});
    const overlay = overlayCompactVisibility(persisted, partition);
    expect(persisted).toEqual({});
    expect(overlay).toEqual({
      [COMPACT_EXPAND_COLUMN_ID]: true,
      expand: true,
      name: true,
      status: false,
      transportStatus: false,
    });
  });

  it("hides expand columns when the compact row has no expand control", () => {
    const overlay = overlayCompactVisibility(
      Object.freeze({}),
      partition,
      false
    );
    expect(overlay[COMPACT_EXPAND_COLUMN_ID]).toBe(false);
    expect(overlay.expand).toBe(false);
  });

  it("keeps a user-hidden primary hidden and does not resurrect it", () => {
    const overlay = overlayCompactVisibility({ name: false }, partition);
    expect(overlay.name).toBe(false);
  });
});

describe("visible collapsed and stacked ids", () => {
  it("omits columns the user hid on desktop from the compact panel and stack", () => {
    expect(
      visibleCollapsedIds(["transportStatus", "guardians"], {
        guardians: false,
      })
    ).toEqual(["transportStatus"]);
    expect(
      visibleStackedPrimaryIds(["status", "id"], { status: false })
    ).toEqual(["id"]);
  });
});

describe("applyCompactVisibilityChange", () => {
  const partition = partitionCompactColumns(centerColumns);

  it("does not persist overlay-forced hides of collapsed columns", () => {
    const persisted = {};
    const overlay = overlayCompactVisibility(persisted, partition);
    const nextPersisted = applyCompactVisibilityChange(
      persisted,
      overlay,
      overlay,
      partition
    );
    expect(nextPersisted).toEqual({});
    expect(nextPersisted).not.toHaveProperty("transportStatus");
    expect(nextPersisted).not.toHaveProperty(COMPACT_EXPAND_COLUMN_ID);
    expect(nextPersisted).not.toHaveProperty("expand");
  });

  it("persists hiding the first primary from the columns picker", () => {
    const persisted = {};
    const overlay = overlayCompactVisibility(persisted, partition);
    const nextPersisted = applyCompactVisibilityChange(
      persisted,
      overlay,
      { ...overlay, name: false },
      partition
    );
    expect(nextPersisted).toEqual({ name: false });
  });
});

describe("findExistingExpandColumnId", () => {
  it("finds expand or compactExpand and ignores other columns", () => {
    expect(findExistingExpandColumnId([{ id: "name" }, { id: "expand" }])).toBe(
      "expand"
    );
    expect(
      findExistingExpandColumnId([
        { id: COMPACT_EXPAND_COLUMN_ID },
        { id: "name" },
      ])
    ).toBe(COMPACT_EXPAND_COLUMN_ID);
    expect(findExistingExpandColumnId([{ id: "name" }])).toBeUndefined();
  });
});
describe("compact expand column placement", () => {
  it("does not insert a second expand column when expand is already present", () => {
    expect(
      insertExpandColumn(
        [
          { header: "", id: "expand" },
          { header: "", id: "name" },
        ],
        { header: "", id: COMPACT_EXPAND_COLUMN_ID }
      ).map((column) => column.id)
    ).toEqual(["expand", "name"]);
    expect(
      insertExpandColumn(
        [
          { header: "", id: COMPACT_EXPAND_COLUMN_ID },
          { header: "", id: "name" },
        ],
        { header: "", id: "expand" }
      ).map((column) => column.id)
    ).toEqual([COMPACT_EXPAND_COLUMN_ID, "name"]);
  });

  it("inserts the expand column after select when present", () => {
    const expand = { id: COMPACT_EXPAND_COLUMN_ID, header: "" };
    expect(
      insertExpandColumn(
        [
          { id: "select", header: "" },
          { id: "name", header: "" },
        ],
        expand
      ).map((column) => column.id)
    ).toEqual(["select", COMPACT_EXPAND_COLUMN_ID, "name"]);
    expect(
      insertExpandColumn([{ id: "name", header: "" }], expand).map(
        (column) => column.id
      )
    ).toEqual([COMPACT_EXPAND_COLUMN_ID, "name"]);
  });

  it("places expand after select in column order and strips it for persistence", () => {
    expect(withCompactExpandOrder(["name", "select", "actions"], true)).toEqual(
      ["select", COMPACT_EXPAND_COLUMN_ID, "name", "actions"]
    );
    expect(withCompactExpandOrder(["name", "actions"], false)).toEqual([
      COMPACT_EXPAND_COLUMN_ID,
      "name",
      "actions",
    ]);
    expect(
      stripCompactExpandId(["select", COMPACT_EXPAND_COLUMN_ID, "name"])
    ).toEqual(["select", "name"]);
  });
});

describe("withCompactExpandPinning", () => {
  it("pins expand after select without dropping existing start pins", () => {
    expect(
      withCompactExpandPinning({ end: ["actions"], start: ["select"] })
    ).toEqual({
      end: ["actions"],
      start: ["select", COMPACT_EXPAND_COLUMN_ID],
    });
  });
});
