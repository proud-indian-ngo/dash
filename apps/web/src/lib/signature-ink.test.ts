import { describe, expect, it } from "bun:test";

import {
  hasEnoughInk,
  inkBounds,
  inkSummary,
  type SignatureStroke,
  toPadPoint,
} from "./signature-ink";

/** A horizontal line across `fraction` of the pad's width. */
const line = (fraction: number, y = 0.5): SignatureStroke => [
  { x: 0.1, y },
  { x: 0.1 + fraction, y },
];

/** A zigzag like handwriting: `count` peaks across `width` of the pad. */
const zigzag = (width: number, count: number): SignatureStroke =>
  Array.from({ length: count * 2 + 1 }, (_, i) => ({
    x: 0.1 + (width * i) / (count * 2),
    y: i % 2 === 0 ? 0.6 : 0.3,
  }));

describe("hasEnoughInk", () => {
  it("waits while nothing is drawn", () => {
    expect(hasEnoughInk([])).toBe(false);
  });

  it("refuses a tap or a dot", () => {
    expect(hasEnoughInk([[{ x: 0.5, y: 0.5 }]])).toBe(false);
    expect(
      hasEnoughInk([
        [
          { x: 0.5, y: 0.5 },
          { x: 0.505, y: 0.5 },
        ],
      ])
    ).toBe(false);
  });

  it("refuses a short tick", () => {
    expect(hasEnoughInk([line(0.12)])).toBe(false);
  });

  it("refuses many tiny marks bunched in one spot", () => {
    // Plenty of ink, but it spans under 15% of the pad.
    const scribble = Array.from({ length: 20 }, () =>
      zigzag(0.08, 3).map((p) => ({ ...p, y: p.y / 4 + 0.4 }))
    );
    expect(inkSummary(scribble).length).toBeGreaterThan(0.5);
    expect(hasEnoughInk(scribble)).toBe(false);
  });

  it("accepts a signature written across the pad", () => {
    expect(hasEnoughInk([zigzag(0.5, 4)])).toBe(true);
  });

  it("adds up several strokes, as with initials", () => {
    const first = zigzag(0.12, 1);
    const second = zigzag(0.12, 1).map((p) => ({ ...p, x: p.x + 0.2 }));
    expect(hasEnoughInk([first])).toBe(false);
    expect(hasEnoughInk([first, second, line(0.3, 0.8)])).toBe(true);
  });

  it("measures height in pad widths, since the pad is twice as wide", () => {
    // Top to bottom of the pad is half a pad width.
    const vertical: SignatureStroke = [
      { x: 0.5, y: 0 },
      { x: 0.5, y: 1 },
    ];
    expect(inkSummary([vertical])).toEqual({ extent: 0.5, length: 0.5 });
  });
});

describe("inkBounds", () => {
  it("boxes every point", () => {
    expect(inkBounds([line(0.2, 0.4), [{ x: 0.5, y: 0.9 }]])).toEqual({
      maxX: 0.5,
      maxY: 0.9,
      minX: 0.1,
      minY: 0.4,
    });
    expect(inkBounds([])).toBeNull();
  });
});

describe("toPadPoint", () => {
  const rect = { height: 100, left: 10, top: 20, width: 200 };

  it("maps a pointer to a fraction of the pad", () => {
    expect(toPadPoint(110, 70, rect)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("keeps points that leave the pad on its edge", () => {
    expect(toPadPoint(-50, 500, rect)).toEqual({ x: 0, y: 1 });
  });
});
