import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { brotliCompress, gzip, zstdCompress } from "node:zlib";

const SOURCE_MAP_ARTIFACT = /\.map(?:\.br|\.gz|\.zst)?$/;

// The async codecs run on libuv's thread pool, so files compress in parallel;
// the sync ones serialised every chunk on the main thread.
const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const zstdCompressAsync = promisify(zstdCompress);

async function finalizeFile(file: string) {
  if (SOURCE_MAP_ARTIFACT.test(file)) {
    await unlink(file);
    return;
  }

  const compressed = file.endsWith(".js.br")
    ? { compress: brotliCompressAsync, suffixLength: 3 }
    : file.endsWith(".js.gz")
      ? { compress: gzipAsync, suffixLength: 3 }
      : file.endsWith(".js.zst")
        ? { compress: zstdCompressAsync, suffixLength: 4 }
        : undefined;
  if (!compressed) {
    return;
  }

  const javascript = await readFile(file.slice(0, -compressed.suffixLength));
  await writeFile(file, await compressed.compress(javascript));
}

export async function finalizePublicAssets(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? finalizePublicAssets(entryPath)
        : finalizeFile(entryPath);
    })
  );
}

if (import.meta.main) {
  const directory = process.argv[2];
  if (!directory) {
    throw new Error("Usage: finalize-public-assets.ts <public-directory>");
  }
  await finalizePublicAssets(directory);
}
