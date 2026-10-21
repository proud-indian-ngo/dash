import {
  PAYEE_SIGNATURE_MAX_BYTES,
  PAYEE_SIGNATURE_MAX_HEIGHT,
  PAYEE_SIGNATURE_MAX_WIDTH,
} from "@pi-dash/shared/payee-signature";

/** Phone photos are decoded at most this long, well inside canvas limits. */
const DECODE_LONG_SIDE = 2400;
/** Ink fades out this far below the paper's brightness (0–255)… */
const FADE_START = 30;
/** …and is fully opaque this far below it. */
const FADE_END = 110;
/** Paper darker than this is a photo too dark to separate ink from. */
const MIN_PAPER = 140;
const PADDING = 8;
const MIN_INK_SIDE = 64;
/** The server's least side and least long side for a signature PNG. */
const MIN_OUT_SIDE = 16;
const MIN_OUT_LONG_SIDE = 64;

export interface SignatureCrop {
  height: number;
  width: number;
  x: number;
  y: number;
}

/**
 * Makes the paper transparent in RGBA pixels, in place, and returns the
 * box around the ink. The paper's brightness is read from the image (the
 * 90th percentile), so a shadowed phone photo works as well as a scan, and
 * alpha fades with lightness so the ink keeps soft edges. Throws a message
 * for the person when there is no usable signature.
 */
export function removeSignaturePaper(
  data: Uint8ClampedArray,
  width: number,
  height: number
): SignatureCrop {
  const count = width * height;
  const light = new Uint8Array(count);
  const histogram = new Array<number>(256).fill(0);
  for (let p = 0; p < count; p++) {
    const i = p * 4;
    // Already-transparent pixels count as paper, whatever colour they hold.
    const value =
      (data[i + 3] ?? 0) < 32
        ? 255
        : Math.round(
            0.299 * (data[i] ?? 0) +
              0.587 * (data[i + 1] ?? 0) +
              0.114 * (data[i + 2] ?? 0)
          );
    light[p] = value;
    histogram[value] = (histogram[value] ?? 0) + 1;
  }
  let paper = 255;
  for (let seen = 0, level = 0; level < 256; level++) {
    seen += histogram[level] ?? 0;
    if (seen >= count * 0.9) {
      paper = level;
      break;
    }
  }
  if (paper < MIN_PAPER) {
    throw new Error(
      "That photo is too dark. Sign in dark ink on white paper, in good light"
    );
  }
  const transparentAt = paper - FADE_START;
  const opaqueAt = paper - FADE_END;
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let p = 0; p < count; p++) {
    const i = p * 4;
    const value = light[p] ?? 255;
    const ink =
      value >= transparentAt
        ? 0
        : value <= opaqueAt
          ? 1
          : (transparentAt - value) / (transparentAt - opaqueAt);
    const alpha = Math.round(ink * (data[i + 3] ?? 0));
    data[i + 3] = alpha;
    if (alpha >= 128) {
      const x = p % width;
      const y = (p - x) / width;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (
    right < 0 ||
    (right - left < MIN_INK_SIDE && bottom - top < MIN_INK_SIDE)
  ) {
    throw new Error(
      "No signature found. Sign in dark ink on white paper and try again"
    );
  }
  const x = Math.max(0, left - PADDING);
  const y = Math.max(0, top - PADDING);
  return {
    height: Math.min(height, bottom + 1 + PADDING) - y,
    width: Math.min(width, right + 1 + PADDING) - x,
    x,
    y,
  };
}

/**
 * The PNG's size for a crop: scaled down to the server's limits, and grown
 * to its least sides (the ink is centred on transparent space) so a long,
 * thin signature is still accepted.
 */
export function signatureOutputSize(crop: SignatureCrop): {
  height: number;
  scale: number;
  width: number;
} {
  const scale = Math.min(
    1,
    PAYEE_SIGNATURE_MAX_WIDTH / crop.width,
    PAYEE_SIGNATURE_MAX_HEIGHT / crop.height
  );
  const width = Math.max(MIN_OUT_SIDE, Math.round(crop.width * scale));
  const height = Math.max(MIN_OUT_SIDE, Math.round(crop.height * scale));
  return width < MIN_OUT_LONG_SIDE && height < MIN_OUT_LONG_SIDE
    ? { height, scale, width: MIN_OUT_LONG_SIDE }
    : { height, scale, width };
}

async function decode(file: File): Promise<ImageBitmap> {
  const full = await createImageBitmap(file, {
    imageOrientation: "from-image",
  }).catch(() => {
    throw new Error("That file isn't an image. Choose a PNG, JPEG or WebP");
  });
  const scale = DECODE_LONG_SIDE / Math.max(full.width, full.height);
  if (scale >= 1) {
    return full;
  }
  const resized = await createImageBitmap(full, {
    resizeHeight: Math.round(full.height * scale),
    resizeQuality: "high",
    resizeWidth: Math.round(full.width * scale),
  });
  full.close();
  return resized;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("This browser can't prepare the signature");
  }
  return context;
}

/**
 * Turns a photo or scan of a signature into the PNG receipts print: the
 * paper made transparent, cropped to the ink and fitted to the server's
 * signature limits (8-bit RGBA, at most 1200×600 and 512 KB).
 */
export async function receiptSignaturePng(file: File): Promise<Blob> {
  const bitmap = await decode(file);
  const source = document.createElement("canvas");
  source.width = bitmap.width;
  source.height = bitmap.height;
  const sourceContext = context2d(source);
  sourceContext.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = sourceContext.getImageData(0, 0, source.width, source.height);
  const crop = removeSignaturePaper(pixels.data, pixels.width, pixels.height);
  sourceContext.putImageData(pixels, 0, 0);
  const size = signatureOutputSize(crop);
  const out = document.createElement("canvas");
  out.width = size.width;
  out.height = size.height;
  const outContext = context2d(out);
  outContext.imageSmoothingQuality = "high";
  const drawnWidth = Math.round(crop.width * size.scale);
  const drawnHeight = Math.round(crop.height * size.scale);
  outContext.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    Math.round((size.width - drawnWidth) / 2),
    Math.round((size.height - drawnHeight) / 2),
    drawnWidth,
    drawnHeight
  );
  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob(resolve, "image/png")
  );
  if (!blob || blob.size > PAYEE_SIGNATURE_MAX_BYTES) {
    throw new Error("That signature is too detailed. Try a plainer scan");
  }
  return blob;
}
