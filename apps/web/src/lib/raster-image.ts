import { readPngHeader } from "@pi-dash/shared/payee-signature";

import { HttpError } from "./http-error";

const JPEG_START_OF_FRAME = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegDimensions(
  bytes: Uint8Array,
  view: DataView
): [number, number] | null {
  if (
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  ) {
    return null;
  }
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }
    while (bytes[offset] === 0xff) {
      offset += 1;
    }
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xda || marker === 0xd9) {
      return null;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > bytes.length) {
      return null;
    }
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) {
      return null;
    }
    if (JPEG_START_OF_FRAME.has(marker)) {
      return length >= 8
        ? [view.getUint16(offset + 5), view.getUint16(offset + 3)]
        : null;
    }
    offset += length;
  }
  return null;
}

function rasterDimensions(
  bytes: Uint8Array,
  mimeType: string
): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, end));
  if (mimeType === "image/png") {
    const header = readPngHeader(bytes);
    return header &&
      bytes.length >= 45 &&
      ascii(bytes.length - 8, bytes.length - 4) === "IEND"
      ? [header.width, header.height]
      : null;
  }
  if (mimeType === "image/gif") {
    return bytes.length >= 14 &&
      ["GIF87a", "GIF89a"].includes(ascii(0, 6)) &&
      bytes.at(-1) === 0x3b
      ? [view.getUint16(6, true), view.getUint16(8, true)]
      : null;
  }
  if (mimeType === "image/jpeg") {
    return jpegDimensions(bytes, view);
  }
  if (
    mimeType !== "image/webp" ||
    bytes.length < 30 ||
    ascii(0, 4) !== "RIFF" ||
    ascii(8, 12) !== "WEBP" ||
    view.getUint32(4, true) + 8 !== bytes.length
  ) {
    return null;
  }
  const chunk = ascii(12, 16);
  if (chunk === "VP8X" && view.getUint32(16, true) === 10) {
    return [
      1 + (view.getUint32(24, true) & 0xffffff),
      1 + (view.getUint32(26, true) >>> 8),
    ];
  }
  if (
    chunk === "VP8 " &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return [
      view.getUint16(26, true) & 0x3fff,
      view.getUint16(28, true) & 0x3fff,
    ];
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const dimensions = view.getUint32(21, true);
    return [(dimensions & 0x3fff) + 1, ((dimensions >>> 14) & 0x3fff) + 1];
  }
  return null;
}

/** Signature/header checks, not a full image decoder. Never accepts SVG. */
export function assertRasterImage(bytes: Uint8Array, mimeType: string): void {
  const dimensions = rasterDimensions(bytes, mimeType);
  if (!dimensions) {
    throw new HttpError(400, "Invalid image format or content type");
  }
  const [width, height] = dimensions;
  if (
    width === 0 ||
    height === 0 ||
    width > 16_384 ||
    height > 16_384 ||
    width * height > 40_000_000
  ) {
    throw new HttpError(400, "Image dimensions exceed the supported limit");
  }
}
