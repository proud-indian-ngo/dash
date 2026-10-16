import { describe, expect, it, mock } from "bun:test";

import { readPayeeSignatureImage } from "./payee-signature-image";

/** The start of a PNG declaring these header fields, padded to `size`. */
function png(
  width: number,
  height: number,
  { colourType = 6, size = 2048 } = {}
): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = colourType;
  return bytes;
}

const file = (bytes: Uint8Array, exists = true) => ({
  arrayBuffer: mock(async () => bytes.buffer as ArrayBuffer),
  exists: async () => exists,
  stat: async () => ({ size: bytes.byteLength }),
});

describe("readPayeeSignatureImage", () => {
  it("reads a PNG the pad could have drawn", async () => {
    const result = await readPayeeSignatureImage(file(png(480, 160)));
    expect("image" in result && result.image.byteLength).toBe(2048);
  });

  it("skips huge dimensions declared in a small file", async () => {
    expect(await readPayeeSignatureImage(file(png(6000, 6000)))).toEqual({
      skipped: "payee_signature_too_large",
    });
    expect(await readPayeeSignatureImage(file(png(10_000, 10_000)))).toEqual({
      skipped: "payee_signature_too_large",
    });
  });

  it("skips an oversized file without downloading it", async () => {
    const big = file(png(480, 160, { size: 512 * 1024 + 1 }));
    expect(await readPayeeSignatureImage(big)).toEqual({
      skipped: "payee_signature_too_large",
    });
    expect(big.arrayBuffer).not.toHaveBeenCalled();
  });

  it("skips a wrong colour type or a blank 1×1", async () => {
    for (const bytes of [png(480, 160, { colourType: 3 }), png(1, 1)]) {
      expect(await readPayeeSignatureImage(file(bytes))).toEqual({
        skipped: "payee_signature_invalid",
      });
    }
  });

  it("skips a missing object", async () => {
    expect(await readPayeeSignatureImage(file(png(480, 160), false))).toEqual({
      skipped: "payee_signature_missing",
    });
  });

  it("throws storage errors so the job retries", async () => {
    await expect(
      readPayeeSignatureImage({
        ...file(png(480, 160)),
        stat: () => Promise.reject(new Error("connection reset")),
      })
    ).rejects.toThrow("connection reset");
  });
});
