import { describe, expect, it } from "bun:test";

import {
  removeSignaturePaper,
  signatureOutputSize,
} from "./receipt-signature-image";

/** An opaque image of one grey level, with an optional dark ink rectangle. */
function photo(
  width: number,
  height: number,
  paper: number,
  ink?: { h: number; level: number; w: number; x: number; y: number }
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside =
        ink &&
        x >= ink.x &&
        x < ink.x + ink.w &&
        y >= ink.y &&
        y < ink.y + ink.h;
      const level = inside ? ink.level : paper;
      data.set([level, level, level, 255], (y * width + x) * 4);
    }
  }
  return data;
}

const alphaAt = (
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number
) => data[(y * width + x) * 4 + 3];

describe("removeSignaturePaper", () => {
  it("clears white paper and crops to the ink with padding", () => {
    const data = photo(300, 120, 250, {
      h: 20,
      level: 20,
      w: 200,
      x: 50,
      y: 40,
    });
    const crop = removeSignaturePaper(data, 300, 120);
    expect(crop).toEqual({ height: 36, width: 216, x: 42, y: 32 });
    expect(alphaAt(data, 300, 5, 5)).toBe(0);
    expect(alphaAt(data, 300, 100, 50)).toBe(255);
  });

  it("reads the paper level from a shadowed photo instead of a fixed cut-off", () => {
    // Grey paper (170) would stay opaque under a fixed threshold of 200.
    const data = photo(300, 120, 170, {
      h: 20,
      level: 30,
      w: 200,
      x: 50,
      y: 40,
    });
    removeSignaturePaper(data, 300, 120);
    expect(alphaAt(data, 300, 5, 5)).toBe(0);
    expect(alphaAt(data, 300, 100, 50)).toBe(255);
  });

  it("keeps a signature already on a transparent background", () => {
    const data = photo(300, 120, 0, { h: 20, level: 20, w: 200, x: 50, y: 40 });
    // Transparent black around the ink, as a drawn PNG has.
    for (let p = 0; p < 300 * 120; p++) {
      const x = p % 300;
      const y = Math.floor(p / 300);
      if (!(x >= 50 && x < 250 && y >= 40 && y < 60)) {
        data[p * 4 + 3] = 0;
      }
    }
    expect(removeSignaturePaper(data, 300, 120).width).toBe(216);
    expect(alphaAt(data, 300, 100, 50)).toBe(255);
  });

  it("refuses blank paper and a photo too dark to read", () => {
    expect(() => removeSignaturePaper(photo(200, 100, 250), 200, 100)).toThrow(
      "No signature found"
    );
    expect(() =>
      removeSignaturePaper(
        photo(200, 100, 90, { h: 20, level: 10, w: 150, x: 20, y: 40 }),
        200,
        100
      )
    ).toThrow("too dark");
  });
});

describe("signatureOutputSize", () => {
  it("scales a large crop down to the server's limits", () => {
    expect(
      signatureOutputSize({ height: 800, width: 2400, x: 0, y: 0 })
    ).toEqual({
      height: 400,
      scale: 0.5,
      width: 1200,
    });
  });

  it("keeps a long, thin signature at least 16 px tall", () => {
    const size = signatureOutputSize({ height: 20, width: 3000, x: 0, y: 0 });
    expect(size.width).toBe(1200);
    expect(size.height).toBe(16);
  });
});
