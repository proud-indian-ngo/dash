import { describe, expect, it } from "bun:test";

import { RESOLUTION_TEXT_MAX } from "@pi-dash/shared/resolutions";
import {
  MAX_TABLE_COLUMNS,
  parseRichText,
  type RichTextTable,
  richTextToPlain,
} from "@pi-dash/shared/rich-text";

import { generateCircularResolutionPdf } from "./circular-resolution";
import { pdfWords } from "./pdf-text.test-helper";
import { columnWidths } from "./rich-text";
import { richSample } from "./rich-text.test-helper";

const p = (text: string) => ({ children: [{ text }], type: "p" });
const row = (type: "td" | "th", cells: string[]) => ({
  children: cells.map((text) => ({ children: [p(text)], type })),
  type: "tr",
});
const item = (text: string, nested?: unknown) => ({
  children: [
    { children: [{ text }], type: "lic" },
    ...(nested ? [nested] : []),
  ],
  type: "li",
});

function circular(body: unknown[]) {
  return generateCircularResolutionPdf({
    authority: "Clause 4.18 of the Trust Deed",
    issuedOn: "2026-10-21",
    issuer: { name: "Asha Rao", office: "Managing Trustee" },
    org: { address: "Bengaluru 560016", name: "Proud Indian" },
    reference: "C-0193ABCD",
    resolutions: [
      {
        body: JSON.stringify(body),
        threshold: "Majority of trustees in office (2 of 3)",
        title: "Rich text",
      },
    ],
    responseDueOn: "2026-10-28",
    signers: [{ name: "Trustee 1", offices: "", trusteeId: "01930000" }],
  });
}

describe("columnWidths", () => {
  it("gives a long column more room, within bounds, and fills the width", () => {
    const table = parseRichText(richSample).find(
      (b): b is RichTextTable => b.type === "table"
    )!;
    const [head, purpose, amount] = columnWidths(table);
    expect(purpose).toBeGreaterThan(head!);
    expect(head).toBeGreaterThan(amount!);
    // Half an equal share, plus half by weight (88 characters count as 40).
    expect(purpose).toBeCloseTo((0.5 / 3 + (0.5 * 40) / (20 + 40 + 11)) * 100);
    expect(head! + purpose! + amount!).toBeCloseTo(100);
  });

  it("keeps every column at least half an equal share", () => {
    const table = {
      children: [
        {
          children: Array.from({ length: MAX_TABLE_COLUMNS }, (_, i) => ({
            children: [p(i === 0 ? "x".repeat(200) : "1")],
            type: "td",
          })),
          type: "tr",
        },
      ],
      type: "table",
    } as RichTextTable;
    for (const width of columnWidths(table)) {
      expect(width).toBeGreaterThanOrEqual(50 / MAX_TABLE_COLUMNS);
    }
  });
});

describe("rich text in the PDF", () => {
  it("draws every word of a table cell holding the longest text allowed", async () => {
    const words = Array.from(
      { length: 2400 },
      (_, i) => `w${String(i).padStart(5, "0")}`
    );
    const long = words.join(" ");
    const body = [
      {
        children: [row("th", ["Head", "Text"]), row("td", ["Long", long])],
        type: "table",
      },
    ];
    expect(
      richTextToPlain(parseRichText(JSON.stringify(body))).length
    ).toBeLessThanOrEqual(RESOLUTION_TEXT_MAX);
    const drawn = new Set(await pdfWords(await circular(body)));
    expect(words.filter((w) => !drawn.has(w))).toEqual([]);
  });

  it("draws every cell of a table with the most columns allowed", async () => {
    const cells = (r: number) =>
      Array.from(
        { length: MAX_TABLE_COLUMNS },
        (_, c) => `r${String(r)}c${String(c)} Rs 4,50,000`
      );
    const body = [
      {
        children: [
          row("th", cells(0)),
          row("td", cells(1)),
          row("td", cells(2)),
        ],
        type: "table",
      },
    ];
    const drawn = new Set(await pdfWords(await circular(body)));
    const expected = [0, 1, 2].flatMap((r) =>
      cells(r).map((c) => c.split(" ")[0]!)
    );
    expect(expected.filter((w) => !drawn.has(w))).toEqual([]);
    expect(drawn.has("4,50,000")).toBe(true);
  });

  it("numbers by the numbered lists an item sits in", async () => {
    const body = [
      // A numbered list inside a bulleted one counts from 1.
      {
        children: [item("bullet", { children: [item("ulol")], type: "ol" })],
        type: "ul",
      },
      // ol > ul > ol: the inner numbered list is the second level, a.
      {
        children: [
          item("outer", {
            children: [
              item("middle", { children: [item("inner")], type: "ol" }),
            ],
            type: "ul",
          }),
        ],
        type: "ol",
      },
    ];
    const words = await pdfWords(await circular(body));
    expect(words[words.indexOf("ulol") - 1]).toBe("1.");
    expect(words[words.indexOf("outer") - 1]).toBe("1.");
    expect(words[words.indexOf("inner") - 1]).toBe("a.");
  });
});
