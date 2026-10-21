import {
  PAYEE_SIGNATURE_MAX_BYTES,
  PAYEE_SIGNATURE_MAX_HEIGHT,
  PAYEE_SIGNATURE_MAX_WIDTH,
} from "@pi-dash/shared/payee-signature";

/** Lighter than this (0–255) counts as paper and turns transparent. */
const PAPER = 200;
const PADDING = 8;
const MIN_INK_SIDE = 64;

/**
 * Turns a photo or scan of a signature into the PNG receipts print: the
 * paper made transparent, cropped to the ink and scaled to fit the server's
 * signature limits (8-bit RGBA, at most 1200×600 and 512 KB). Throws a
 * message for the person when the image holds no usable signature.
 */
export async function receiptSignaturePng(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That file isn't an image. Choose a PNG or JPEG");
  });
  const source = document.createElement("canvas");
  source.width = bitmap.width;
  source.height = bitmap.height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("This browser can't prepare the signature");
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = context.getImageData(0, 0, source.width, source.height);
  const { data, height, width } = pixels;
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const light =
        0.299 * (data[i] ?? 0) +
        0.587 * (data[i + 1] ?? 0) +
        0.114 * (data[i + 2] ?? 0);
      if (light > PAPER || (data[i + 3] ?? 0) < 32) {
        data[i + 3] = 0;
        continue;
      }
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right - left < MIN_INK_SIDE && bottom - top < MIN_INK_SIDE) {
    throw new Error(
      "No signature found. Sign in dark ink on white paper and try again"
    );
  }
  context.putImageData(pixels, 0, 0);
  const cropX = Math.max(0, left - PADDING);
  const cropY = Math.max(0, top - PADDING);
  const cropWidth = Math.min(width, right + PADDING) - cropX;
  const cropHeight = Math.min(height, bottom + PADDING) - cropY;
  const scale = Math.min(
    1,
    PAYEE_SIGNATURE_MAX_WIDTH / cropWidth,
    PAYEE_SIGNATURE_MAX_HEIGHT / cropHeight
  );
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cropWidth * scale));
  out.height = Math.max(1, Math.round(cropHeight * scale));
  out
    .getContext("2d")
    ?.drawImage(
      source,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      out.width,
      out.height
    );
  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob(resolve, "image/png")
  );
  if (!blob || blob.size > PAYEE_SIGNATURE_MAX_BYTES) {
    throw new Error("That signature is too detailed. Try a plainer scan");
  }
  return blob;
}
