import { describe, expect, it } from "vitest";
import { mergeColumnOrder, resolveColumnDefId } from "./table-utils";

describe("resolveColumnDefId", () => {
  it("prefers explicit column ids", () => {
    expect(resolveColumnDefId({ accessorKey: "email", id: "contact" })).toBe(
      "contact"
    );
  });

  it("falls back to accessorKey", () => {
    expect(resolveColumnDefId({ accessorKey: "email" })).toBe("email");
  });
});

describe("mergeColumnOrder", () => {
  it("returns visible columns when persisted order is empty", () => {
    expect(mergeColumnOrder([], ["name", "email", "actions"])).toEqual([
      "name",
      "email",
      "actions",
    ]);
  });

  it("appends new columns missing from persisted order", () => {
    expect(
      mergeColumnOrder(["email", "actions"], ["name", "email", "actions"])
    ).toEqual(["email", "actions", "name"]);
  });

  it("drops stale ids that are no longer visible", () => {
    expect(mergeColumnOrder(["legacy", "email"], ["email", "actions"])).toEqual(
      ["email", "actions"]
    );
  });
});
