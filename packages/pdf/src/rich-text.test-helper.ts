/** A resolution body with every format rich text allows, for the PDF tests. */

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

export const richSample = JSON.stringify([
  {
    children: [
      { bold: true, text: "RESOLVED THAT" },
      { text: " the budget for 2027-28 be approved, " },
      { italic: true, text: "as placed before the Board" },
      { text: ", under the heads below, " },
      { bold: true, italic: true, text: "with effect from 1 April 2027" },
      { text: ", and that " },
      { text: "no head be exceeded", underline: true },
      { text: " without the Board's approval." },
    ],
    type: "p",
  },
  {
    children: [
      row("th", ["Head", "Purpose", "Amount (Rs)"]),
      row("td", [
        "Kalakriti",
        "Venue, judges' honoraria, certificates and the prize fund for the annual art competition",
        "4,50,000",
      ]),
      row("td", [
        "Volunteer programmes",
        "Events, travel and materials",
        "2,00,000",
      ]),
      row("td", [
        "Administration",
        "Audit fee, bank charges and filings",
        "75,000",
      ]),
    ],
    type: "table",
  },
  p("RESOLVED FURTHER THAT the Managing Trustee be authorised to:"),
  {
    children: [
      item("release funds against each head as approved,"),
      item("reallocate within a head, up to:", {
        children: [
          item("ten per cent of the head, and"),
          item("Rs 25,000 in a quarter;"),
        ],
        type: "ol",
      }),
      item("report the spending at each board meeting."),
    ],
    type: "ol",
  },
  {
    children: [
      item("Statements go to every trustee."),
      item("The secretary keeps the register."),
    ],
    type: "ul",
  },
]);
