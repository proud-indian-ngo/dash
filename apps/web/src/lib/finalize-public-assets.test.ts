import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  brotliDecompressSync,
  gunzipSync,
  zstdDecompressSync,
} from "node:zlib";

import { finalizePublicAssets } from "../../scripts/finalize-public-assets";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("recompresses rewritten JavaScript and removes every source map artifact", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pi-dash-public-assets-"));
  temporaryDirectories.push(directory);
  const assets = path.join(directory, "assets");
  mkdirSync(assets);

  const javascript = Buffer.from("console.log('rewritten by PostHog');\n");
  writeFileSync(path.join(assets, "app.js"), javascript);
  writeFileSync(path.join(assets, "app.js.br"), "stale brotli");
  writeFileSync(path.join(assets, "app.js.gz"), "stale gzip");
  writeFileSync(path.join(assets, "app.js.zst"), "stale zstd");
  for (const sourceMap of [
    "app.js.map",
    "app.js.map.br",
    "app.js.map.gz",
    "app.js.map.zst",
  ]) {
    writeFileSync(path.join(assets, sourceMap), "private source map");
  }

  await finalizePublicAssets(directory);

  expect(
    brotliDecompressSync(readFileSync(path.join(assets, "app.js.br")))
  ).toEqual(javascript);
  expect(gunzipSync(readFileSync(path.join(assets, "app.js.gz")))).toEqual(
    javascript
  );
  expect(
    zstdDecompressSync(readFileSync(path.join(assets, "app.js.zst")))
  ).toEqual(javascript);
  for (const sourceMap of [
    "app.js.map",
    "app.js.map.br",
    "app.js.map.gz",
    "app.js.map.zst",
  ]) {
    expect(existsSync(path.join(assets, sourceMap))).toBe(false);
  }
});
