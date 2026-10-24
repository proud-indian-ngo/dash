import { describe, expect, it } from "bun:test";

import { PlateRenderer } from "@pi-dash/editor/renderer";
import {
  malformedPlateDocuments,
  validPlateDocuments,
} from "@pi-dash/shared/plate-content.test-fixtures";
import { renderToStaticMarkup } from "react-dom/server";

import { BaseMentionKit } from "../../../../../packages/editor/components/editor/plugins/mention-base-kit";

describe("PlateRenderer stored content", () => {
  it("contains an unexpected plugin failure during SSR", () => {
    const plugin = BaseMentionKit[0]!;
    const original = plugin.node.component;
    plugin.node.component = () => {
      throw new Error("Unexpected plugin failure");
    };
    try {
      const html = renderToStaticMarkup(
        <>
          <PlateRenderer
            content={JSON.stringify(validPlateDocuments.mention)}
          />
          <p>Neighbouring content</p>
        </>
      );
      expect(html).toContain("Unable to display this content.");
      expect(html).toContain("Neighbouring content");
    } finally {
      plugin.node.component = original;
    }
  });
  for (const [name, value] of Object.entries(malformedPlateDocuments)) {
    it(`shows the fallback for ${name}`, () => {
      expect(
        renderToStaticMarkup(<PlateRenderer content={JSON.stringify(value)} />)
      ).toContain("Unable to display this content.");
    });
  }

  for (const [name, value] of Object.entries(validPlateDocuments)) {
    it(`renders supported ${name} content`, () => {
      const html = renderToStaticMarkup(
        <PlateRenderer content={JSON.stringify(value)} />
      );
      expect(html).not.toContain("Unable to display this content.");
      expect(html).toContain("data-slate-editor");
    });
  }
});
