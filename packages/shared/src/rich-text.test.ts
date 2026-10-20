import { describe, expect, it } from "vitest";

import {
  bodyUntouched,
  RESOLUTION_TEMPLATES,
  RESOLUTION_TEXT_MAX,
  resolutionBodyProblem,
  resolutionBodySchema,
  resolutionTemplateKeyValues,
  templateBody,
} from "./resolutions";
import {
  listNumber,
  MAX_TABLE_COLUMNS,
  parseRichText,
  plainTextToRichText,
  RichTextError,
  richTextHasText,
  richTextToPlain,
  type RichTextValue,
} from "./rich-text";

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

describe("parseRichText", () => {
  it("keeps paragraphs, marks, nested lists and tables", () => {
    expect(parseRichText(JSON.stringify(sample))).toEqual(sample);
  });

  it("drops editor properties and false marks", () => {
    const value = parseRichText(
      JSON.stringify([
        {
          children: [{ bold: false, text: "a" }],
          id: "x",
          type: "p",
        },
        {
          children: [
            {
              children: [{ children: [p("b")], colSpan: 1, type: "td" }],
              type: "tr",
            },
          ],
          colSizes: [120],
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

  it.each([
    ["a heading", [{ children: [{ text: "x" }], type: "h1" }]],
    [
      "a link",
      [
        {
          children: [
            { children: [{ text: "x" }], type: "a", url: "https://x" },
          ],
          type: "p",
        },
      ],
    ],
    ["a colour", [{ children: [{ color: "red", text: "x" }], type: "p" }]],
    [
      "strikethrough",
      [{ children: [{ strikethrough: true, text: "x" }], type: "p" }],
    ],
    ["an image", [{ children: [{ text: "" }], type: "img", url: "x" }]],
    [
      "a merged cell",
      [
        {
          children: [
            {
              children: [{ children: [p("x")], colSpan: 2, type: "td" }],
              type: "tr",
            },
          ],
          type: "table",
        },
      ],
    ],
    [
      "a table in a table",
      [
        {
          children: [
            {
              children: [
                { children: [{ children: [], type: "table" }], type: "td" },
              ],
              type: "tr",
            },
          ],
          type: "table",
        },
      ],
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
    ],
    ["an empty document", []],
  ])("refuses %s", (_, value) => {
    expect(() => parseRichText(JSON.stringify(value))).toThrow(RichTextError);
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
      JSON.stringify([{ children: [{ text: "x" }], type: "blockquote" }])
    );
    expect(result.error?.issues[0]?.message).toBe(
      "Use paragraphs, lists and tables only, not blockquote."
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
});

describe("resolution templates", () => {
  it.each(resolutionTemplateKeyValues)(
    "%s is valid rich text, untouched when fresh, with bold lead words",
    (key) => {
      const value = parseRichText(templateBody(key));
      expect(value).toEqual(RESOLUTION_TEMPLATES[key].body);
      expect(bodyUntouched(templateBody(key), key)).toBe(true);
      for (const block of value) {
        if (block.type !== "p") {
          continue;
        }
        const [lead, ...rest] = block.children;
        expect(lead?.text).toMatch(/^RESOLVED (FURTHER )?THAT ?$/);
        expect(lead?.bold).toBe(true);
        expect(rest.every((l) => !l.bold)).toBe(true);
      }
    }
  );
});
