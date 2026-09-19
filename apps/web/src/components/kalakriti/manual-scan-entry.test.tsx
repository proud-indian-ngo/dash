import { describe, expect, it } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { ManualScanEntry } from "./manual-scan-entry";

describe("ManualScanEntry", () => {
  it("keeps manual inputs collapsed behind an accessible toggle by default", () => {
    const html = renderToStaticMarkup(
      <ManualScanEntry>
        <input aria-label="Yearly ID" />
      </ManualScanEntry>
    );

    expect(html).toContain("Enter ID manually");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('aria-label="Yearly ID"');
  });
});
