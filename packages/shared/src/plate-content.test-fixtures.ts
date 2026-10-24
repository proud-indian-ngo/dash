const paragraph = { children: [{ text: "Feedback" }], type: "p" };

export const validPlateDocuments = {
  empty: [],
  normalizedEmpty: [{ children: [{ text: "" }], type: "p" }],
  marks: [
    { children: [{ bold: true, italic: true, text: "Feedback" }], type: "p" },
  ],
  link: [
    {
      children: [
        {
          children: [{ text: "Website" }],
          type: "a",
          url: "https://example.org",
        },
      ],
      type: "p",
    },
  ],
  mention: [
    {
      children: [
        { children: [{ text: "" }], type: "mention", value: "Volunteer" },
      ],
      type: "p",
    },
  ],
  table: [
    {
      children: [
        {
          children: [{ children: [paragraph], colSpan: 2, type: "th" }],
          type: "tr",
        },
      ],
      colSizes: [120, 240],
      type: "table",
    },
  ],
  image: [
    {
      caption: [{ text: "Caption" }],
      children: [{ text: "" }],
      type: "img",
      url: "/existing-image.jpg",
      width: 240,
    },
  ],
  list: [
    {
      children: [{ children: [{ ...paragraph, type: "lic" }], type: "li" }],
      type: "ul",
    },
  ],
  code: [
    {
      children: [
        { children: [{ text: "const answer = 42;" }], type: "code_line" },
      ],
      lang: "js",
      type: "code_block",
    },
  ],
  toggle: [{ children: [{ text: "Details" }], id: "toggle-1", type: "toggle" }],
  legacyQuote: [{ children: [{ text: "Quote" }], type: "blockquote" }],
  unknownPlugin: [
    {
      children: [{ text: "Future content" }],
      type: "future_block",
      metadata: { version: 1 },
      value: { harmless: "unknown plugin data" },
    },
  ],
};

export const malformedPlateDocuments = {
  objectCodeLanguage: [
    {
      type: "code_block",
      lang: { toString: null },
      children: [{ type: "code_line", children: [{ text: "const x = 1;" }] }],
    },
  ],
  objectId: [{ ...paragraph, id: { toString: null } }],
  objectLeafClassName: [
    {
      type: "p",
      children: [
        { text: "Feedback", className: { toString: null }, code_syntax: true },
      ],
    },
  ],
  objectRowSize: [
    {
      type: "table",
      children: [
        {
          type: "tr",
          size: { toString: null },
          children: [{ type: "td", children: [paragraph] }],
        },
      ],
    },
  ],
  objectCellSpan: [
    {
      type: "table",
      children: [
        {
          type: "tr",
          children: [
            { type: "td", colSpan: { toString: null }, children: [paragraph] },
          ],
        },
      ],
    },
  ],
  excessiveCellSpan: [
    {
      type: "table",
      children: [
        {
          type: "tr",
          children: [{ type: "td", colSpan: 1e20, children: [paragraph] }],
        },
      ],
    },
  ],
  malformedTableRow: [{ type: "table", children: [{ text: "Feedback" }] }],
  objectMention: [
    {
      type: "p",
      children: [
        { type: "mention", value: { bad: "shape" }, children: [{ text: "" }] },
      ],
    },
  ],
  objectCaption: [
    {
      type: "img",
      url: "/existing-image.jpg",
      caption: { text: "Caption" },
      children: [{ text: "" }],
    },
  ],
  malformedCaptionText: [
    {
      type: "img",
      url: "/existing-image.jpg",
      caption: [{ text: { bad: "shape" } }],
      children: [{ text: "" }],
    },
  ],
  objectColSizes: [
    {
      type: "table",
      colSizes: {},
      children: [
        { type: "tr", children: [{ type: "td", children: [paragraph] }] },
      ],
    },
  ],
  objectColSize: [
    {
      type: "table",
      colSizes: [{ toString: null }],
      children: [
        { type: "tr", children: [{ type: "td", children: [paragraph] }] },
      ],
    },
  ],
  objectImageWidth: [
    {
      type: "img",
      url: "/existing-image.jpg",
      width: { toString: null },
      children: [{ text: "" }],
    },
  ],
  objectTableMargin: [
    {
      type: "table",
      marginLeft: { toString: null },
      children: [
        { type: "tr", children: [{ type: "td", children: [paragraph] }] },
      ],
    },
  ],
  objectCellBackground: [
    {
      type: "table",
      children: [
        {
          type: "tr",
          children: [
            {
              type: "td",
              background: { toString: null },
              children: [paragraph],
            },
          ],
        },
      ],
    },
  ],
  objectLinkUrl: [
    {
      type: "p",
      children: [
        { type: "a", url: { toString: null }, children: [{ text: "Link" }] },
      ],
    },
  ],
  objectIndent: [
    {
      type: "p",
      indent: { valueOf: null, toString: null },
      children: [{ text: "Feedback" }],
    },
  ],
  objectText: [{ children: [{ text: { bad: "shape" } }], type: "p" }],
  numericText: [{ children: [{ text: 42 }], type: "p" }],
  missingText: [{ children: [{}], type: "p" }],
  objectChildren: [{ children: { text: "Feedback" }, type: "p" }],
  stringChildren: [{ children: "Feedback", type: "p" }],
  nullChild: [{ children: [null], type: "p" }],
  missingChildren: [{ type: "p" }],
  emptyChildren: [{ children: [], type: "p" }],
  invalidType: [{ children: [{ text: "Feedback" }], type: {} }],
  mixedNode: [
    {
      children: [{ children: [{ text: "Hidden" }], text: "Feedback" }],
      type: "p",
    },
  ],
  rootLeaf: [{ text: "Feedback" }],
};
