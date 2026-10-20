import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, gzipSync, zstdCompressSync } from "node:zlib";

const SOURCE_MAP_ARTIFACT = /\.map(?:\.br|\.gz|\.zst)?$/;

async function finalizeFile(file: string) {
  if (SOURCE_MAP_ARTIFACT.test(file)) {
    await unlink(file);
    return;
  }

  const compressed = file.endsWith(".js.br")
    ? { compress: brotliCompressSync, suffixLength: 3 }
    : file.endsWith(".js.gz")
      ? { compress: gzipSync, suffixLength: 3 }
      : file.endsWith(".js.zst")
        ? { compress: zstdCompressSync, suffixLength: 4 }
        : undefined;
  if (!compressed) {
    return;
  }

  const javascript = await readFile(file.slice(0, -compressed.suffixLength));
  await writeFile(file, compressed.compress(javascript));
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
