import { describe, expect, it } from "vitest";

import {
  bodyUntouched,
  RESOLUTION_TEXT_MAX,
  resolutionBodyProblem,
  resolutionBodySchema,
  templateBody,
} from "./resolutions";
import {
  listNumber,
  MAX_TABLE_COLUMNS,
  parseRichText,
  plainTextToRichText,
  RichTextError,
  type RichTextTable,
  serializeRichText,
  richTextHasText,
  richTextToPlain,
  type RichTextValue,
} from "./rich-text";
import { storedBodies } from "./rich-text.test-fixtures";

const p = (text: string) => ({ children: [{ text }], type: "p" });

const sample = [
  {
    children: [
      { bold: true, text: "RESOLVED THAT" },
      { text: " the budget be " },
      { italic: true, text: "approved", underline: true },
    ],
    type: "p",
  },
  {
    children: [
      {
        children: [
          { children: [{ text: "Programmes" }], type: "lic" },
          {
            children: [
              {
                children: [{ children: [{ text: "Kalakriti" }], type: "lic" }],
                type: "li",
              },
            ],
            type: "ul",
          },
        ],
        type: "li",
      },
      {
        children: [{ children: [{ text: "Office" }], type: "lic" }],
        type: "li",
      },
    ],
    type: "ol",
  },
  {
    children: [
      {
        children: [
          { children: [p("Head")], type: "th" },
          { children: [p("Amount")], type: "th" },
        ],
        type: "tr",
      },
      {
        children: [
          { children: [p("Kalakriti")], type: "td" },
          { children: [p("Rs 2,00,000")], type: "td" },
        ],
        type: "tr",
      },
    ],
    type: "table",
  },
];

const item = (text: string, ...after: unknown[]) => ({
  children: [{ children: [{ text }], type: "lic" }, ...after],
  type: "li",
});

/** Every format the document editor offers, canonical. */
const everyFormat = [
  { children: [{ text: "Schedule" }], type: "h1" },
  { children: [{ text: "Part A" }], indent: 1, type: "h2" },
  { children: [{ text: "Heads" }], type: "h3" },
  {
    children: [
      { text: "See " },
      {
        children: [{ bold: true, text: "the deed" }],
        type: "a",
        url: "https://example.org/deed",
      },
      { text: ", write to " },
      {
        children: [{ text: "office@proudindian.ngo" }],
        type: "a",
        url: "mailto:office@proudindian.ngo",
      },
      { strikethrough: true, text: " struck" },
    ],
    indent: 4,
    type: "p",
  },
  { children: [{ text: "" }], type: "hr" },
  {
    children: [p("Quoted"), { children: [item("in a quote")], type: "ul" }],
    type: "blockquote",
  },
  {
    children: [
      item("Clause 4 be substituted by:", {
        children: [p("new text")],
        type: "blockquote",
      }),
    ],
    type: "ol",
  },
  {
    children: [
      {
        children: [
          { children: [p("Head")], type: "th" },
          { children: [p("Purpose")], type: "th" },
          { children: [p("Amount")], type: "th" },
        ],
        type: "tr",
      },
      {
        children: [
          {
            children: [{ children: [{ text: "Total" }], type: "h3" }],
            colSpan: 2,
            type: "td",
          },
          {
            children: [
              { children: [p("q")], type: "blockquote" },
              { children: [{ text: "" }], type: "hr" },
            ],
            type: "td",
          },
        ],
        type: "tr",
      },
    ],
    colSizes: [120, 240, 0],
    type: "table",
  },
];

describe("parseRichText", () => {
  it("keeps paragraphs, marks, nested lists and tables", () => {
    expect(parseRichText(JSON.stringify(sample))).toEqual(sample);
  });

  it("drops editor properties, decoration and false marks", () => {
    const value = parseRichText(
      JSON.stringify([
        {
          children: [{ bold: false, text: "a" }],
          id: "x",
          indent: 0,
          type: "p",
        },
        {
          children: [
            {
              children: [
                {
                  background: "#ff0",
                  borders: { top: { size: 2 } },
                  children: [p("b")],
                  colSpan: 1,
                  rowSpan: 1,
                  type: "td",
                },
              ],
              size: 80,
              type: "tr",
            },
          ],
          colSizes: [0],
          marginLeft: 20,
          type: "table",
        },
      ])
    );
    expect(value).toEqual([
      { children: [{ text: "a" }], type: "p" },
      {
        children: [
          { children: [{ children: [p("b")], type: "td" }], type: "tr" },
        ],
        type: "table",
      },
    ]);
  });

  it("keeps stored bodies byte for byte, so they need no migration", () => {
    const stored = [...Object.values(storedBodies), JSON.stringify(sample)];
    expect(Object.keys(storedBodies)).toHaveLength(12);
    for (const json of stored) {
      expect(serializeRichText(parseRichText(json))).toBe(
        serializeRichText(JSON.parse(json))
      );
    }
    for (const json of Object.values(storedBodies)) {
      expect(serializeRichText(parseRichText(json))).toBe(json);
    }
  });

  it("keeps every format the document editor offers", () => {
    expect(parseRichText(JSON.stringify(everyFormat))).toEqual(everyFormat);
  });

  it("is idempotent: the canonical value parses to itself", () => {
    const once = serializeRichText(
      parseRichText(
        JSON.stringify([
          ...everyFormat,
          {
            children: [{ text: "loose quote text" }],
            id: "q",
            type: "blockquote",
          },
        ])
      )
    );
    expect(serializeRichText(parseRichText(once))).toBe(once);
    // Text directly in a quote (before Plate 53) becomes its paragraph.
    expect(JSON.parse(once).at(-1)).toEqual({
      children: [p("loose quote text")],
      type: "blockquote",
    });
  });

  it("reads a pasted colspan attribute as Plate does", () => {
    const [table] = parseRichText(
      JSON.stringify([
        {
          children: [
            {
              children: [
                {
                  attributes: { colspan: "2" },
                  children: [p("a")],
                  type: "td",
                },
              ],
              type: "tr",
            },
            {
              children: [
                { children: [p("b")], type: "td" },
                { children: [p("c")], type: "td" },
              ],
              type: "tr",
            },
          ],
          type: "table",
        },
      ])
    );
    expect((table as RichTextTable).children[0]?.children[0]?.colSpan).toBe(2);
  });

  it("keeps column widths, one per column", () => {
    const [table] = parseRichText(
      JSON.stringify([
        {
          children: [
            {
              children: [
                { children: [p("a")], type: "td" },
                { children: [p("b")], type: "td" },
              ],
              type: "tr",
            },
          ],
          colSizes: [200, "x", 40],
          type: "table",
        },
      ])
    );
    expect(table).toMatchObject({ colSizes: [200, 0] });
  });

  it("refuses a table wider than the column cap", () => {
    const wide = (n: number) =>
      JSON.stringify([
        {
          children: [
            {
              children: Array.from({ length: n }, () => ({
                children: [p("x")],
                type: "td",
              })),
              type: "tr",
            },
          ],
          type: "table",
        },
      ]);
    expect(() => parseRichText(wide(MAX_TABLE_COLUMNS))).not.toThrow();
    expect(() => parseRichText(wide(MAX_TABLE_COLUMNS + 1))).toThrow(
      "A table has at most 8 columns."
    );
  });

  const cellTable = (...cells: unknown[]) => [
    {
      children: [{ children: cells, type: "tr" }],
      type: "table",
    },
  ];
  const linkTo = (url: string) => [
    { children: [{ children: [{ text: "x" }], type: "a", url }], type: "p" },
  ];

  it.each([
    [
      "a fourth-level heading",
      [{ children: [{ text: "x" }], type: "h4" }],
      "Use headings 1 to 3 only.",
    ],
    [
      "a link to a script",
      linkTo("javascript:alert(1)"),
      "A link goes to a web address (https://) or an email address (mailto:).",
    ],
    [
      "a link that isn't an address",
      linkTo("example.org"),
      "A link goes to a web address (https://) or an email address (mailto:).",
    ],
    [
      "a link too long",
      linkTo(`https://example.org/${"x".repeat(2000)}`),
      "A link's address is too long.",
    ],
    [
      "a colour",
      [{ children: [{ color: "red", text: "x" }], type: "p" }],
      "Text can be bold, italic, underlined or struck through, not color.",
    ],
    [
      "a highlight",
      [{ children: [{ highlight: true, text: "x" }], type: "p" }],
      "Text can be bold, italic, underlined or struck through, not highlight.",
    ],
    [
      "inline code",
      [{ children: [{ code: true, text: "x" }], type: "p" }],
      "Text can be bold, italic, underlined or struck through, not code.",
    ],
    [
      "a mention",
      [
        {
          children: [{ children: [{ text: "" }], type: "mention", value: "x" }],
          type: "p",
        },
      ],
      "Only text and links can sit inside a paragraph: no mentions or other inline content.",
    ],
    [
      "an image",
      [{ children: [{ text: "" }], type: "img", url: "x" }],
      "Use paragraphs, headings, quotes, dividers, lists and tables only, not image.",
    ],
    [
      "a code block",
      [{ children: [p("x")], type: "code_block" }],
      "Use paragraphs, headings, quotes, dividers, lists and tables only, not code block.",
    ],
    [
      "a toggle",
      [{ children: [{ text: "x" }], type: "toggle" }],
      "Use paragraphs, headings, quotes, dividers, lists and tables only, not toggle.",
    ],
    [
      "a cell merged down a column",
      cellTable({ children: [p("x")], rowSpan: 2, type: "td" }),
      "Table cells can be merged across a row, not down a column.",
    ],
    [
      "a pasted rowspan",
      cellTable({
        attributes: { rowspan: "2" },
        children: [p("x")],
        type: "td",
      }),
      "Table cells can be merged across a row, not down a column.",
    ],
    [
      "a table in a table",
      cellTable({
        children: [{ children: [{ children: [], type: "tr" }], type: "table" }],
        type: "td",
      }),
      "A table cell can't hold another table.",
    ],
    [
      "a table in a quote",
      [
        {
          children: cellTable({ children: [p("x")], type: "td" }),
          type: "blockquote",
        },
      ],
      "A quote can't hold another quote or a table.",
    ],
    [
      "a quote in a quote",
      [
        {
          children: [{ children: [p("x")], type: "blockquote" }],
          type: "blockquote",
        },
      ],
      "A quote can't hold another quote or a table.",
    ],
    [
      "a table in a list",
      [
        {
          children: [
            {
              children: cellTable({ children: [p("x")], type: "td" }),
              type: "li",
            },
          ],
          type: "ul",
        },
      ],
      "A list item holds text, lists and quotes.",
    ],
    [
      "an indent past the limit",
      [{ ...p("x"), indent: 5 }],
      "Text is indented at most four levels.",
    ],
    [
      "ragged rows",
      [
        {
          children: [
            { children: [{ children: [p("a")], type: "td" }], type: "tr" },
            {
              children: [
                { children: [p("b")], type: "td" },
                { children: [p("c")], type: "td" },
              ],
              type: "tr",
            },
          ],
          type: "table",
        },
      ],
      "Every row of a table needs the same cells.",
    ],
    [
      "merged cells wider than the table",
      [
        {
          children: [
            {
              children: [{ children: [p("a")], colSpan: 3, type: "td" }],
              type: "tr",
            },
            {
              children: [
                { children: [p("b")], type: "td" },
                { children: [p("c")], type: "td" },
              ],
              type: "tr",
            },
          ],
          type: "table",
        },
      ],
      "Every row of a table needs the same cells.",
    ],
    ["an empty document", [], "The text isn't in the expected format."],
  ])("refuses %s", (_, value, message) => {
    expect(() => parseRichText(JSON.stringify(value))).toThrow(
      new RichTextError(message)
    );
  });

  it("refuses plain text", () => {
    expect(() => parseRichText("RESOLVED THAT")).toThrow(RichTextError);
  });
});

describe("richTextToPlain", () => {
  it("writes paragraphs, numbered and nested lists, and table rows", () => {
    expect(richTextToPlain(sample as RichTextValue)).toBe(
      [
        "RESOLVED THAT the budget be approved",
        "1. Programmes\n  - Kalakriti\n2. Office",
        "Head | Amount\nKalakriti | Rs 2,00,000",
      ].join("\n\n")
    );
  });

  it("writes headings, quotes, dividers, links and merged cells", () => {
    expect(richTextToPlain(everyFormat as RichTextValue)).toBe(
      [
        "Schedule",
        "Part A",
        "Heads",
        "See the deed (https://example.org/deed), write to office@proudindian.ngo struck",
        "---",
        "> Quoted\n>\n> - in a quote",
        "1. Clause 4 be substituted by:\n  > new text",
        "Head | Purpose | Amount\nTotal | > q ---",
      ].join("\n\n")
    );
  });

  it("writes a link's address once when the text already is it", () => {
    const link = (text: string, url: string) =>
      richTextToPlain(
        parseRichText(
          JSON.stringify([
            { children: [{ children: [{ text }], type: "a", url }], type: "p" },
          ])
        )
      );
    expect(link("https://example.org", "https://example.org")).toBe(
      "https://example.org"
    );
    expect(link("a@b.org", "mailto:a@b.org")).toBe("a@b.org");
    expect(link("", "https://example.org")).toBe("https://example.org");
    expect(link("site", "https://example.org")).toBe(
      "site (https://example.org)"
    );
  });

  it("skips empty paragraphs", () => {
    expect(
      richTextToPlain(parseRichText(JSON.stringify([p(""), p("a"), p(" ")])))
    ).toBe("a");
  });

  it("numbers by the numbered lists an item sits in", () => {
    const li = (text: string, nested?: unknown) => ({
      children: [
        { children: [{ text }], type: "lic" },
        ...(nested ? [nested] : []),
      ],
      type: "li",
    });
    const value = parseRichText(
      JSON.stringify([
        {
          children: [li("bullet", { children: [li("ulol")], type: "ol" })],
          type: "ul",
        },
        {
          children: [
            li("outer", {
              children: [li("middle", { children: [li("inner")], type: "ol" })],
              type: "ul",
            }),
          ],
          type: "ol",
        },
      ])
    );
    expect(richTextToPlain(value)).toBe(
      "- bullet\n  1. ulol\n\n1. outer\n  - middle\n    a. inner"
    );
  });
});

describe("richTextHasText", () => {
  const emptyList = {
    children: [
      { children: [{ children: [{ text: " " }], type: "lic" }], type: "li" },
    ],
    type: "ul",
  };
  const emptyTable = {
    children: [
      {
        children: [
          { children: [p("")], type: "td" },
          { children: [p("")], type: "td" },
        ],
        type: "tr",
      },
    ],
    type: "table",
  };

  it("finds no text in empty lists and tables, though their plain text has markers", () => {
    const value = parseRichText(JSON.stringify([p(""), emptyList, emptyTable]));
    expect(richTextToPlain(value)).not.toBe("");
    expect(richTextHasText(value)).toBe(false);
  });

  it("finds no text in a divider or an empty quote, and text in a link", () => {
    const hr = { children: [{ text: "" }], type: "hr" };
    const emptyQuote = { children: [p(" ")], type: "blockquote" };
    expect(
      richTextHasText(parseRichText(JSON.stringify([hr, emptyQuote])))
    ).toBe(false);
    expect(
      richTextHasText(
        parseRichText(
          JSON.stringify([
            {
              children: [
                { text: "" },
                { children: [{ text: "x" }], type: "a", url: "https://x.org" },
                { text: "" },
              ],
              type: "p",
            },
          ])
        )
      )
    ).toBe(true);
  });

  it("finds text in a list item or a cell", () => {
    expect(
      richTextHasText(parseRichText(JSON.stringify([emptyTable, p("x")])))
    ).toBe(true);
    expect(richTextHasText(sample as RichTextValue)).toBe(true);
  });

  it("makes a required body refuse an empty list", () => {
    expect(resolutionBodyProblem(JSON.stringify([emptyList]))).toBe(
      "Write the resolution's text."
    );
    expect(resolutionBodyProblem(JSON.stringify(sample))).toBeUndefined();
    expect(resolutionBodyProblem("not json")).toBe(
      "The text isn't in the expected format."
    );
  });
});

describe("plainTextToRichText", () => {
  it("makes a paragraph per blank-line block and joins single breaks", () => {
    expect(
      plainTextToRichText(
        "  First line\n  continues.\n\n\n Second.\r\n \r\nThird "
      )
    ).toEqual([p("First line continues."), p("Second."), p("Third")]);
  });

  it("treats only ASCII whitespace as space, as migration 0176 does", () => {
    expect(plainTextToRichText("first\n \nsecond")).toEqual([
      p("first"),
      p("second"),
    ]);
    // A line of NBSP isn't blank, and NBSP and BOM aren't trimmed.
    expect(plainTextToRichText("\u00A0a\u00A0\n\u00A0\nb\uFEFF")).toEqual([
      p("\u00A0a\u00A0 \u00A0 b\uFEFF"),
    ]);
  });

  it("makes empty text one empty paragraph", () => {
    expect(plainTextToRichText(" \n\n ")).toEqual([p("")]);
  });

  it("seeds a template as paragraphs", () => {
    expect(JSON.parse(templateBody("accounts_approval"))).toHaveLength(2);
  });
});

describe("bodyUntouched", () => {
  it("is true for the template's own text or an empty body", () => {
    expect(
      bodyUntouched(templateBody("budget_approval"), "budget_approval")
    ).toBe(true);
    expect(bodyUntouched(JSON.stringify([p("")]), "budget_approval")).toBe(
      true
    );
  });

  it("is false once the formatting changes, even with the same words", () => {
    const [first] = JSON.parse(templateBody("budget_approval"));
    const bolded = [
      { ...first, children: [{ ...first.children[0], bold: true }] },
    ];
    expect(bodyUntouched(JSON.stringify(bolded), "budget_approval")).toBe(
      false
    );
  });

  it("is false for another template's text or invalid JSON", () => {
    expect(bodyUntouched(templateBody("ordinary"), "budget_approval")).toBe(
      false
    );
    expect(bodyUntouched("{", "budget_approval")).toBe(false);
  });
});

describe("resolutionBodySchema", () => {
  it("stores the canonical JSON", () => {
    const parsed = resolutionBodySchema.safeParse(
      JSON.stringify([{ ...p("a"), id: "1" }])
    );
    expect(parsed).toEqual({
      data: '[{"children":[{"text":"a"}],"type":"p"}]',
      success: true,
    });
  });

  it("counts the plain text against the limit", () => {
    const long = JSON.stringify([p("x".repeat(RESOLUTION_TEXT_MAX + 1))]);
    const result = resolutionBodySchema.safeParse(long);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/under 20,000 characters/);
  });

  it("explains a refused format", () => {
    const result = resolutionBodySchema.safeParse(
      JSON.stringify([{ children: [p("x")], type: "code_block" }])
    );
    expect(result.error?.issues[0]?.message).toBe(
      "Use paragraphs, headings, quotes, dividers, lists and tables only, not code block."
    );
  });
});

describe("listNumber", () => {
  it("numbers 1, a, i by nesting", () => {
    expect([0, 1, 2, 3].map((depth) => listNumber(depth, 3))).toEqual([
      "4",
      "d",
      "iv",
      "4",
    ]);
    expect(listNumber(1, 26)).toBe("aa");
    expect(listNumber(2, 13)).toBe("xiv");
  });

  it("counts in Roman numerals past ten, as CSS lower-roman does", () => {
    expect(
      [39, 40, 49, 50, 90, 400, 1994].map((n) => listNumber(2, n - 1))
    ).toEqual(["xxxix", "xl", "xlix", "l", "xc", "cd", "mcmxciv"]);
    expect(listNumber(2, 3999)).toBe("4000");
  });
});
