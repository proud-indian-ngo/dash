import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { Plugin } from "vite";

const pdfjsRoot = dirname(
  createRequire(import.meta.url).resolve("pdfjs-dist/package.json")
);
const { version } = JSON.parse(
  await readFile(join(pdfjsRoot, "package.json"), "utf8")
) as { version: string };

// Must match PDFJS_ASSETS_PATH in components/shared/pdf-pages.tsx, which
// names the same version through pdfjs-dist's `version` export.
const PUBLIC_PATH = `/pdfjs/${version}/`;
// Image decoders (JBIG2 scans, JPEG 2000), fonts PDFs name without
// embedding, CJK character maps and colour profiles, fetched by the worker.
const ASSET_DIRS = ["cmaps", "iccs", "standard_fonts", "wasm"];

const CONTENT_TYPES: Record<string, string> = {
  ".bcmap": "application/octet-stream",
  ".icc": "application/vnd.iccprofile",
  ".js": "text/javascript",
  ".pfb": "application/octet-stream",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

const contentType = (file: string): string =>
  CONTENT_TYPES[file.slice(file.lastIndexOf("."))] ??
  "application/octet-stream";

/** Serves pdf.js's runtime data under /pdfjs/ in dev and copies it into the client build. */
export function pdfjsAssets(): Plugin {
  return {
    applyToEnvironment: (environment) => environment.name === "client",
    async configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split("?", 1)[0] ?? "";
        const [dir, file, ...rest] = path.startsWith(PUBLIC_PATH)
          ? path.slice(PUBLIC_PATH.length).split("/")
          : [];
        if (!(dir && file && rest.length === 0 && ASSET_DIRS.includes(dir))) {
          next();
          return;
        }
        try {
          const body = await readFile(join(pdfjsRoot, dir, file));
          response.setHeader("Content-Type", contentType(file));
          response.end(body);
        } catch {
          next();
        }
      });
    },
    async generateBundle() {
      for (const dir of ASSET_DIRS) {
        for (const file of await readdir(join(pdfjsRoot, dir))) {
          if (file.startsWith("LICENSE")) {
            continue;
          }
          this.emitFile({
            fileName: `${PUBLIC_PATH.slice(1)}${dir}/${file}`,
            source: await readFile(join(pdfjsRoot, dir, file)),
            type: "asset",
          });
        }
      }
    },
    name: "pdfjs-assets",
  };
}
