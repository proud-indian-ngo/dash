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
  serializeRichText,
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

describe("columnWidths with the editor's sizes", () => {
  const sized = (colSizes: number[]) =>
    columnWidths({
      children: [
        {
          children: colSizes.map(() => ({ children: [p("x")], type: "td" })),
          type: "tr",
        },
      ],
      colSizes,
      type: "table",
    } as RichTextTable);

  it("follows the sizes, a 0 counting as the editor's 120", () => {
    const widths = sized([100, 300, 0]);
    expect(widths[0]).toBeCloseTo((100 / 520) * 100);
    expect(widths[1]).toBeCloseTo((300 / 520) * 100);
    expect(widths[2]).toBeCloseTo((120 / 520) * 100);
  });

  it("keeps every column at least half an equal share", () => {
    const widths = sized([10, 10, 2000, 10, 10, 10, 10, 10]);
    for (const width of widths) {
      expect(width).toBeGreaterThanOrEqual(50 / MAX_TABLE_COLUMNS - 1e-9);
    }
    expect(widths.reduce((sum, w) => sum + w, 0)).toBeCloseTo(100);
  });
});

describe("rich text in the PDF", () => {
  it("draws the existing sample unchanged by the newer formats", () => {
    expect(serializeRichText(parseRichText(richSample))).toBe(
      serializeRichText(JSON.parse(richSample))
    );
  });

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

  /**
   * Draws one table row of `cells` (each cell's blocks, and the columns it
   * spans) and checks every line stays in its cell and every one of `texts`
   * is drawn whole.
   */
  async function expectInsideCells(
    cells: { children: unknown[]; colSpan?: number }[],
    texts: string[],
    colSizes?: number[]
  ) {
    const table = {
      children: [
        {
          children: cells.map((c) => ({ ...c, type: "td" })),
          type: "tr",
        },
      ],
      ...(colSizes ? { colSizes } : {}),
      type: "table",
    };
    const runs = await pdfTextRuns(await circular([table]));
    // The columns' edges on the page: 48pt margins on A4.
    const edges = columnWidths(
      parseRichText(JSON.stringify([table]))[0] as RichTextTable
    ).reduce(
      (acc, w) => [...acc, acc.at(-1)! + (w * (595.28 - 96)) / 100],
      [48]
    );
    // Each cell's edges: the first and past the last column it spans.
    let column = 0;
    const bounds = cells.map((c) => {
      const left = edges[column]!;
      column += c.colSpan ?? 1;
      return { left, right: edges[column]! };
    });
    // The table's text: what's drawn between the title and "Passes with".
    const cellRuns = runs.slice(
      runs.findIndex((r) => r.str === "Rich text") + 1,
      runs.findIndex((r) => r.str.startsWith("Passes with"))
    );
    expect(cellRuns.length).toBeGreaterThanOrEqual(texts.length);
    for (const run of cellRuns) {
      const cell = bounds.findLast((b) => b.left <= run.x + 0.5)!;
      expect(run.x + run.width).toBeLessThanOrEqual(cell.right + 0.5);
    }
    // Lines join back into every text once the break hyphens are dropped.
    const joined = cellRuns.map((r) => r.str.replace(/-$/, "")).join("");
    expect(texts.filter((t) => !joined.includes(t))).toEqual([]);
  }

  function expectInsideColumns(cells: unknown[][], texts: string[]) {
    return expectInsideCells(
      cells.map((children) => ({ children })),
      texts
    );
  }

  it("breaks a long run without spaces inside its own column", async () => {
    const urls = Array.from(
      { length: MAX_TABLE_COLUMNS },
      (_, c) => `https://example.org/reference${String(c)}abcdef`
    );
    await expectInsideColumns(
      urls.map((u) => [p(u)]),
      urls
    );
  });

  it("breaks a run of the widest letters inside its own column", async () => {
    const runs = Array.from(
      { length: MAX_TABLE_COLUMNS },
      (_, c) => `${"W".repeat(9)}${String(c)}`
    );
    await expectInsideColumns(
      runs.map((r) => [p(r)]),
      runs
    );
  });

  it("keeps lists nested six deep inside the narrowest columns", async () => {
    const nested = (cell: number, level: number): unknown => ({
      children: [
        item(
          `WXYZ${String(cell)}${String(level)}`,
          level < 6 ? nested(cell, level + 1) : undefined
        ),
      ],
      type: level % 2 ? "ol" : "ul",
    });
    const cells = Array.from({ length: MAX_TABLE_COLUMNS }, (_, c) => [
      nested(c, 1),
    ]);
    await expectInsideColumns(
      cells,
      cells.flatMap((_, c) =>
        [1, 2, 3, 4, 5, 6].map((l) => `WXYZ${String(c)}${String(l)}`)
      )
    );
  });

  it("keeps headings and quotes inside the narrowest columns", async () => {
    const cells = Array.from({ length: MAX_TABLE_COLUMNS }, (_, c) => [
      { children: [{ text: `HEAD${String(c)}WWWWWW` }], type: "h1" },
      { children: [p(`QUOTE${String(c)}WWWWW`)], type: "blockquote" },
      { children: [{ text: `IND${String(c)}WWWWWWW` }], indent: 4, type: "p" },
    ]);
    await expectInsideColumns(
      cells,
      cells.flatMap((_, c) => [
        `HEAD${String(c)}WWWWWW`,
        `QUOTE${String(c)}WWWWW`,
        `IND${String(c)}WWWWWWW`,
      ])
    );
  });

  it("keeps merged cells inside the columns they span", async () => {
    const url = (n: number) => `https://example.org/merged${String(n)}abcdefgh`;
    await expectInsideCells(
      [
        { children: [p(`${url(0)} ${url(1)}`)], colSpan: 3 },
        { children: [p("x")] },
        { children: [p(url(2))], colSpan: 2 },
        { children: [p(url(3))], colSpan: 2 },
      ],
      [url(0), url(1), url(2), url(3)]
    );
  });

  it("keeps cells inside columns sized in the editor", async () => {
    const words = ["SIZEDWWWWWWWWWW0", "SIZEDWWWWWWWWWW1", "SIZEDWWWWWWWWWW2"];
    await expectInsideCells(
      words.map((w) => ({ children: [p(w)] })),
      words,
      [40, 600, 0]
    );
  });

  it("draws every word of headings, quotes, dividers, links and merged cells", async () => {
    const body = [
      { children: [{ text: "Heading-one words" }], type: "h1" },
      { children: [{ text: "Heading-two words" }], indent: 2, type: "h2" },
      { children: [{ text: "Heading-three words" }], type: "h3" },
      {
        children: [
          { text: "Struck", strikethrough: true },
          { text: " and " },
          { strikethrough: true, text: "both", underline: true },
          { text: " then " },
          {
            children: [{ bold: true, text: "the deed" }],
            type: "a",
            url: "https://example.org/deed",
          },
          { text: " or " },
          {
            children: [{ text: "office@proudindian.ngo" }],
            type: "a",
            url: "mailto:office@proudindian.ngo",
          },
          { text: " or " },
          {
            children: [{ text: "https://example.org/same" }],
            type: "a",
            url: "https://example.org/same",
          },
        ],
        indent: 4,
        type: "p",
      },
      {
        children: [
          { text: "The policy in full is on the safeguarding page, at " },
          {
            children: [{ text: "the policy page" }],
            type: "a",
            url: "https://proudindian.ngo/policies/child-safeguarding-and-protection",
          },
          { text: "." },
        ],
        type: "p",
      },
      { children: [{ text: "" }], type: "hr" },
      {
        children: [
          p("Quoted clause text"),
          { children: [item("quoted item")], type: "ol" },
        ],
        type: "blockquote",
      },
      {
        children: [
          item("Clause one", {
            children: [p("substituted text")],
            type: "blockquote",
          }),
          item("Clause two"),
        ],
        type: "ol",
      },
      {
        children: [
          row("th", ["Head", "Purpose", "Amount"]),
          {
            children: [
              { children: [p("Total label")], colSpan: 2, type: "td" },
              { children: [p("Rs 9,99,000")], type: "td" },
            ],
            type: "tr",
          },
        ],
        colSizes: [100, 300, 0],
        type: "table",
      },
    ];
    const pdf = await circular(body);
    const drawn = (await pdfWords(pdf)).join(" ");
    const expected = richTextToPlain(parseRichText(JSON.stringify(body)))
      .split(/[\s|]+/)
      .filter((w) => w && w !== "-" && w !== ">" && w !== "---");
    expect(expected.filter((w) => !drawn.includes(w))).toEqual([]);
    // A link's address follows its text; one whose text is the address shows it once.
    expect(drawn).toContain("the deed (https://example.org/deed)");
    expect(drawn).toContain("office@proudindian.ngo or");
    expect(drawn.match(/example\.org\/same/g)).toHaveLength(1);
    // A long address that fits a line isn't broken with a hyphen.
    expect(await pdfWords(pdf)).toContain(
      "(https://proudindian.ngo/policies/child-safeguarding-and-protection)."
    );
    // The quoted clause is numbered with its item and keeps its own text.
    const words = await pdfWords(pdf);
    expect(words[words.indexOf("Clause") - 1]).toBe("1.");
    expect(words[words.indexOf("quoted") - 1]).toBe("1.");
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
        .filter((w) => w && w !== "-" && w !== ">")
    );
    expect(expected.filter((w) => !drawn.includes(w))).toEqual([]);
  });
});
