import { readFile } from "node:fs/promises";

import { kalakritiIdCardAssets } from "@pi-dash/pdf/kalakriti-id-card-assets";
import type { Plugin } from "vite";

// Embed server-only PDF assets so the deployed bundle has no source-tree paths.
export function kalakritiPdfAssets(): Plugin {
  return {
    name: "kalakriti-pdf-assets",
    transform(code, id) {
      if (!id.endsWith("/pdfkit/js/pdfkit.node.mjs")) return;
      // PDFKit's createRequire calls lose their package import map when bundled.
      const imports: string[] = [];
      const transformed = code.replace(
        /require\$1\('#standard-fonts\/(\w+)'\)/g,
        (_, font: string) => {
          imports.push(
            `import font${font} from './standard-fonts/${font}.mjs';`
          );
          return `font${font}`;
        }
      );
      return { code: `${imports.join("\n")}\n${transformed}`, map: null };
    },
    async load(id) {
      if (!id.endsWith("/packages/pdf/src/kalakriti-id-card-assets.ts")) return;
      const assets = Object.fromEntries(
        await Promise.all(
          Object.entries(kalakritiIdCardAssets).map(async ([key, file]) => {
            const mime = file.endsWith(".ttf") ? "font/ttf" : "image/png";
            return [
              key,
              `data:${mime};base64,${(await readFile(file)).toString("base64")}`,
            ];
          })
        )
      );
      return `export const kalakritiIdCardAssets = ${JSON.stringify(assets)};`;
    },
  };
}
