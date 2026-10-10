import { describe, expect, it } from "bun:test";

import {
  groupRowId,
  mergeGroupExpanded,
  orderByGroup,
  splitGroupExpanded,
} from "./data-table-group";

const rows = [
  { id: "a", status: "approved" },
  { id: "b", status: "pending" },
  { id: "c", status: "rejected" },
  { id: "d", status: "pending" },
  { id: "e", status: "paid" },
];
const getStatus = (row: { status: string }) => row.status;

describe("orderByGroup", () => {
  it("puts listed groups first and keeps row order within a group", () => {
    const ordered = orderByGroup(rows, getStatus, ["pending", "rejected"]);
    expect(ordered.map((row) => row.id)).toEqual(["b", "d", "c", "a", "e"]);
  });

  it("falls back to first-seen order without a list", () => {
    const ordered = orderByGroup(rows, getStatus);
    expect(ordered.map((row) => row.id)).toEqual(["a", "b", "d", "c", "e"]);
  });
});

describe("group expansion", () => {
  const groupIds = ["pending", "approved"].map((value) =>
    groupRowId("status", value)
  );

  it("opens every group that is not collapsed and keeps leaf rows", () => {
    expect(
      mergeGroupExpanded({ b: true }, groupIds, new Set(["status:approved"]))
    ).toEqual({ b: true, "status:pending": true });
  });

  it("splits a toggled state back into collapsed groups and leaf rows", () => {
    const { collapsed, leaf } = splitGroupExpanded(
      { b: true, "status:approved": true },
      groupIds
    );
    expect([...collapsed]).toEqual(["status:pending"]);
    expect(leaf).toEqual({ b: true });
  });

  it("treats expand-all as every group open", () => {
    const { collapsed, leaf } = splitGroupExpanded(true, groupIds);
    expect(collapsed.size).toBe(0);
    expect(leaf).toEqual({});
  });
});
