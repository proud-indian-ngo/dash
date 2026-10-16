import {
  PAYEE_SIGNATURE_MAX_HEIGHT,
  PAYEE_SIGNATURE_MAX_WIDTH,
} from "@pi-dash/shared/payee-signature";

/**
 * Strokes drawn on the signature pad, kept as data rather than pixels so a
 * resize or an orientation change redraws them instead of losing them, and
 * the exported PNG never depends on the screen it was drawn on.
 *
 * The pad keeps a fixed aspect ratio, so a point is stored as a fraction of
 * the pad's width (`x`) and height (`y`), both from 0 to 1.
 */
export interface SignaturePoint {
  x: number;
  y: number;
}

export type SignatureStroke = readonly SignaturePoint[];

/** Width over height of the pad; fixed so strokes map back exactly. */
export const SIGNATURE_PAD_ASPECT = 2;

/**
 * The least ink that counts as a signature, in pad widths: the strokes
 * together must run at least half the pad's width, and the drawing must
 * span at least 15% of it in some direction. A tap, a dot or a short tick
 * doesn't pass; a short name or initials written normally do.
 */
export const MIN_INK_LENGTH = 0.5;
export const MIN_INK_EXTENT = 0.15;

export interface InkBounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

/** The box around every point, or null without ink. */
export function inkBounds(
  strokes: readonly SignatureStroke[]
): InkBounds | null {
  let bounds: InkBounds | null = null;
  for (const stroke of strokes) {
    for (const { x, y } of stroke) {
      bounds = bounds
        ? {
            maxX: Math.max(bounds.maxX, x),
            maxY: Math.max(bounds.maxY, y),
            minX: Math.min(bounds.minX, x),
            minY: Math.min(bounds.minY, y),
          }
        : { maxX: x, maxY: y, minX: x, minY: y };
    }
  }
  return bounds;
}

/** How much was drawn, measured in pad widths. */
export function inkSummary(strokes: readonly SignatureStroke[]): {
  extent: number;
  length: number;
} {
  let length = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i += 1) {
      const from = stroke[i - 1];
      const to = stroke[i];
      if (from && to) {
        length += Math.hypot(
          to.x - from.x,
          (to.y - from.y) / SIGNATURE_PAD_ASPECT
        );
      }
    }
  }
  const bounds = inkBounds(strokes);
  const extent = bounds
    ? Math.max(
        bounds.maxX - bounds.minX,
        (bounds.maxY - bounds.minY) / SIGNATURE_PAD_ASPECT
      )
    : 0;
  return { extent, length };
}

/** Whether the strokes are enough to confirm as a signature. */
export function hasEnoughInk(strokes: readonly SignatureStroke[]): boolean {
  const { extent, length } = inkSummary(strokes);
  return length >= MIN_INK_LENGTH && extent >= MIN_INK_EXTENT;
}

/** A point inside the pad, from a pointer position over its box. */
export function toPadPoint(
  clientX: number,
  clientY: number,
  rect: { height: number; left: number; top: number; width: number }
): SignaturePoint {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    x: clamp((clientX - rect.left) / rect.width),
    y: clamp((clientY - rect.top) / rect.height),
  };
}

/** Ink width as a fraction of the pad's width: about 2.5px on a phone. */
export const INK_WIDTH = 0.0075;

/** Product ink (the voucher's text colour), so the PNG reads as written. */
export const INK_COLOUR = "#0F1B24";

/**
 * Draws strokes into a canvas context sized `width` by `height` pixels,
 * smoothing each through the midpoints of its points.
 */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly SignatureStroke[],
  width: number,
  height: number,
  offset: { x: number; y: number } = { x: 0, y: 0 }
): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK_COLOUR;
  ctx.fillStyle = INK_COLOUR;
  ctx.lineWidth = Math.max(1, INK_WIDTH * width);
  const px = (point: SignaturePoint) => ({
    x: point.x * width - offset.x,
    y: point.y * height - offset.y,
  });
  for (const stroke of strokes) {
    const first = stroke[0];
    if (!first) {
      continue;
    }
    const start = px(first);
    if (stroke.length === 1) {
      ctx.beginPath();
      ctx.arc(start.x, start.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < stroke.length - 1; i += 1) {
      const point = stroke[i];
      const next = stroke[i + 1];
      if (point && next) {
        const control = px(point);
        const nextPx = px(next);
        ctx.quadraticCurveTo(
          control.x,
          control.y,
          (control.x + nextPx.x) / 2,
          (control.y + nextPx.y) / 2
        );
      }
    }
    const last = stroke.at(-1);
    if (last) {
      const end = px(last);
      ctx.lineTo(end.x, end.y);
    }
    ctx.stroke();
  }
}

/**
 * Export size of the whole pad (the most the server accepts); the PNG is
 * cropped to the ink.
 */
const EXPORT_WIDTH = PAYEE_SIGNATURE_MAX_WIDTH;
const EXPORT_HEIGHT = PAYEE_SIGNATURE_MAX_HEIGHT;

/**
 * The signature as a PNG cropped to the ink with a small margin, on white,
 * so it reads in any image viewer (dark ink on transparent doesn't on a
 * dark background) and prints like paper.
 */
export function signaturePngBlob(
  strokes: readonly SignatureStroke[]
): Promise<Blob> {
  const bounds = inkBounds(strokes);
  if (!bounds) {
    return Promise.reject(new Error("Nothing was drawn"));
  }
  const width = EXPORT_WIDTH;
  const height = EXPORT_HEIGHT;
  const margin = INK_WIDTH * width * 2;
  const left = Math.max(0, Math.floor(bounds.minX * width - margin));
  const top = Math.max(0, Math.floor(bounds.minY * height - margin));
  const right = Math.min(width, Math.ceil(bounds.maxX * width + margin));
  const bottom = Math.min(height, Math.ceil(bounds.maxY * height + margin));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, right - left);
  canvas.height = Math.max(1, bottom - top);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Canvas isn't available"));
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawStrokes(ctx, strokes, width, height, { x: left, y: top });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Couldn't draw the signature"));
      }
    }, "image/png");
  });
}
