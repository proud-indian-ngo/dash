import { describe, expect, it } from "bun:test";

import { generateCircularResolutionPdf } from "./circular-resolution";

const props = {
  authority: "Clause 4.18 of the Trust Deed (Doc. No. 864, Book IV, 2018-19)",
  body: "RESOLVED THAT the registered office of the Trust be shifted.\n\nRESOLVED FURTHER THAT the Managing Trustee be authorised to file the change.",
  issuedOn: "2026-10-20",
  issuer: { name: "Asha Rao", office: "Managing Trustee" },
  org: { address: "Bengaluru 560016", name: "Proud Indian" },
  reference: "C-0193ABCD",
  responseDueOn: "2026-10-27",
  signers: Array.from({ length: 6 }, (_, i) => ({
    name: `Trustee ${i + 1}`,
    offices: i === 0 ? "Managing Trustee" : "",
    trusteeId: `0193000${i}`,
  })),
  threshold: "Majority of trustees in office (4 of 6)",
  title: "Shift of the registered office",
};

describe("generateCircularResolutionPdf", () => {
  it("renders the text page and two signature pages for six trustees", async () => {
    const pdf = await generateCircularResolutionPdf(props);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.match(/\/Type \/Page\b/g)?.length).toBe(3);
  });

  it("renders the same bytes twice, so an issue can be retried", async () => {
    const [a, b] = await Promise.all([
      generateCircularResolutionPdf(props),
      generateCircularResolutionPdf(props),
    ]);
    expect(a.equals(b)).toBe(true);
  });
});
