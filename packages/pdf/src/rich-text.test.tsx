import { describe, expect, it } from "bun:test";

import { parseRichText, type RichTextTable } from "@pi-dash/shared/rich-text";

import { columnWidths } from "./rich-text";
import { richSample } from "./rich-text.test-helper";

describe("columnWidths", () => {
  it("gives a long column more room, within bounds, and fills the width", () => {
    const table = parseRichText(richSample).find(
      (b): b is RichTextTable => b.type === "table"
    )!;
    const [head, purpose, amount] = columnWidths(table);
    expect(purpose).toBeGreaterThan(head!);
    expect(head).toBeGreaterThan(amount!);
    // The purpose column's 88 characters count as 40.
    expect(purpose).toBeCloseTo((40 / (20 + 40 + 11)) * 100);
    expect(head! + purpose! + amount!).toBeCloseTo(100);
  });
});
