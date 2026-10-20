import { describe, expect, it } from "bun:test";

import {
  RESOLUTION_TEMPLATES,
  RESOLUTION_TEXT_MAX,
  resolutionTemplateKeyValues,
  templateBody,
} from "@pi-dash/shared/resolutions";
import {
  MAX_TABLE_COLUMNS,
  parseRichText,
  type RichTextTable,
  richTextToPlain,
} from "@pi-dash/shared/rich-text";

import { generateCircularResolutionPdf } from "./circular-resolution";
import { pdfTextRuns, pdfWords } from "./pdf-text.test-helper";
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

  /** Draws `texts` as one table row and checks each line stays in its column. */
  async function expectInsideColumns(texts: string[]) {
    const table = { children: [row("td", texts)], type: "table" };
    const runs = await pdfTextRuns(await circular([table]));
    // The columns' edges on the page: 48pt margins on A4.
    const edges = columnWidths(table as RichTextTable).reduce(
      (acc, w) => [...acc, acc.at(-1)! + (w * (595.28 - 96)) / 100],
      [48]
    );
    // The table's text: what's drawn between the title and "Passes with".
    const cellRuns = runs.slice(
      runs.findIndex((r) => r.str === "Rich text") + 1,
      runs.findIndex((r) => r.str.startsWith("Passes with"))
    );
    expect(cellRuns.length).toBeGreaterThanOrEqual(texts.length);
    for (const run of cellRuns) {
      const column = edges.findLastIndex((e) => e <= run.x + 0.5);
      expect(run.x + run.width).toBeLessThanOrEqual(edges[column + 1]! + 0.5);
    }
    // Lines join back into every cell's text once the break hyphens are dropped.
    const joined = cellRuns.map((r) => r.str.replace(/-$/, "")).join("");
    expect(texts.filter((t) => !joined.includes(t))).toEqual([]);
  }

  it("breaks a long run without spaces inside its own column", async () => {
    await expectInsideColumns(
      Array.from(
        { length: MAX_TABLE_COLUMNS },
        (_, c) => `https://example.org/reference${String(c)}abcdef`
      )
    );
  });

  it("breaks a run of the widest letters inside its own column", async () => {
    await expectInsideColumns(
      Array.from(
        { length: MAX_TABLE_COLUMNS },
        (_, c) => `${"W".repeat(9)}${String(c)}`
      )
    );
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

describe("resolution templates in the PDF", () => {
  it("draws every template's text in one circular", async () => {
    const pdf = await generateCircularResolutionPdf({
      authority: "Clause 4.18 of the Trust Deed",
      issuedOn: "2026-10-21",
      issuer: { name: "Asha Rao", office: "Managing Trustee" },
      org: { address: "Bengaluru 560016", name: "Proud Indian" },
      reference: "C-0193ABCD",
      resolutions: resolutionTemplateKeyValues.map((key) => ({
        body: templateBody(key),
        threshold: "Majority of trustees in office (2 of 3)",
        title: RESOLUTION_TEMPLATES[key].title,
      })),
      responseDueOn: "2026-10-28",
      signers: [{ name: "Trustee 1", offices: "", trusteeId: "01930000" }],
    });
    // Runs split at marks ("THAT" and ","), so match against the joined text.
    const drawn = (await pdfWords(pdf)).join("");
    const expected = resolutionTemplateKeyValues.flatMap((key) =>
      richTextToPlain(RESOLUTION_TEMPLATES[key].body)
        .split(/[\s|]+/)
        .filter((w) => w && w !== "-")
    );
    expect(expected.filter((w) => !drawn.includes(w))).toEqual([]);
  });
});
