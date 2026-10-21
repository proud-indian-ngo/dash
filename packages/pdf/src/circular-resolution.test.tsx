import { describe, expect, it } from "bun:test";

import {
  plainTextToRichText,
  serializeRichText,
} from "@pi-dash/shared/rich-text";

import { generateCircularResolutionPdf } from "./circular-resolution";
import { richSample } from "./rich-text.test-helper";

const plain = (text: string) => serializeRichText(plainTextToRichText(text));

const props = {
  authority: "Clause 4.18 of the Trust Deed (Doc. No. 864, Book IV, 2018-19)",
  issuedOn: "2026-10-20",
  issuer: { name: "Asha Rao", office: "Managing Trustee" },
  org: { address: "Bengaluru 560016", name: "Proud Indian" },
  reference: "C-0193ABCD",
  resolutions: [
    {
      body: plain(
        "RESOLVED THAT the registered office of the Trust be shifted.\n\nRESOLVED FURTHER THAT the Managing Trustee be authorised to file the change."
      ),
      threshold: "Majority of trustees in office (4 of 6)",
      title: "Shift of the registered office",
    },
  ],
  responseDueOn: "2026-10-27",
  signers: Array.from({ length: 6 }, (_, i) => ({
    name: `Trustee ${i + 1}`,
    offices: i === 0 ? "Managing Trustee" : "",
    trusteeId: `0193000${i}`,
  })),
};

describe("generateCircularResolutionPdf", () => {
  it("renders the text page and two signature pages for six trustees", async () => {
    const pdf = await generateCircularResolutionPdf(props);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.match(/\/Type \/Page\b/g)?.length).toBe(3);
  });

  it("puts several resolutions on the text pages before the signatures", async () => {
    const pdf = await generateCircularResolutionPdf({
      ...props,
      resolutions: Array.from({ length: 4 }, (_, i) => ({
        body: plain("RESOLVED THAT the Board approves it. ".repeat(20)),
        threshold: "Majority of trustees in office (4 of 6)",
        title: `Resolution ${i + 1}`,
      })),
    });
    const pages = pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0;
    expect(pages).toBeGreaterThanOrEqual(3);
  });

  it("draws a table, lists and bold, italic and underlined text", async () => {
    const pdf = await generateCircularResolutionPdf({
      ...props,
      resolutions: [{ ...props.resolutions[0]!, body: richSample }],
    });
    const text = pdf.toString("latin1");
    // Bold, italic and bold italic each embed their own Geist face.
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+Geist-SemiBold\b/);
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+Geist-Italic\b/);
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+Geist-SemiBoldItalic\b/);
    // The signature pages don't move: one text page, two signature pages.
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
