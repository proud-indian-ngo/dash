import { describe, expect, it } from "bun:test";

import { generateConflictDeclarationPdf } from "./conflict-declaration";

const props = {
  declaredAt: "17 Oct 2026, 10:00 am",
  declaredOn: "2026-10-17",
  fiscalYear: "2026-27",
  interests: [
    {
      nature: "Supplies printing",
      party: "Rao Printers",
      relationship: "Spouse's firm",
    },
  ],
  org: { address: "Bengaluru 560016", name: "Proud Indian" },
  trustee: { name: "Asha Rao", offices: "Managing Trustee" },
};

describe("generateConflictDeclarationPdf", () => {
  it("renders one page, with or without interests", async () => {
    for (const interests of [props.interests, []]) {
      const pdf = await generateConflictDeclarationPdf({ ...props, interests });
      const text = pdf.toString("latin1");
      expect(text.startsWith("%PDF-")).toBe(true);
      expect(text.match(/\/Type \/Page\b/g)?.length).toBe(1);
    }
  });
});
