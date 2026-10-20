import { describe, expect, it } from "vitest";

import {
  RESOLUTION_TEXT_MAX,
  resolutionBodySchema,
  templateBody,
} from "./resolutions";
import {
  listNumber,
  parseRichText,
  plainTextToRichText,
  RichTextError,
  richTextJsonToPlain,
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
    expect(richTextJsonToPlain(JSON.stringify([p(""), p("a"), p(" ")]))).toBe(
      "a"
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

  it("makes empty text one empty paragraph", () => {
    expect(plainTextToRichText(" \n\n ")).toEqual([p("")]);
  });

  it("seeds a template as paragraphs", () => {
    expect(JSON.parse(templateBody("accounts_approval"))).toHaveLength(2);
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
