import { describe, expect, it } from "vitest";

import { isPlateValue } from "./plate-content";
import {
  malformedPlateDocuments,
  validPlateDocuments,
} from "./plate-content.test-fixtures";

describe("isPlateValue", () => {
  for (const [name, value] of Object.entries(validPlateDocuments)) {
    it(`accepts ${name} without changing plugin properties`, () => {
      const before = JSON.stringify(value);
      expect(isPlateValue(value)).toBe(true);
      expect(JSON.stringify(value)).toBe(before);
    });
  }

  for (const [name, value] of Object.entries(malformedPlateDocuments)) {
    it(`rejects ${name}`, () => {
      expect(isPlateValue(value)).toBe(false);
    });
  }

  it.each([null, {}, "text", 42, [null], [[{ text: "Feedback" }]]])(
    "rejects a non-document value %j",
    (value) => {
      expect(isPlateValue(value)).toBe(false);
    }
  );

  it("bounds deeply nested documents and cycles", () => {
    let node: unknown = { text: "Feedback" };
    for (let depth = 0; depth < 100; depth += 1) {
      node = { children: [node], type: "p" };
    }
    expect(isPlateValue([node])).toBe(false);
    const children: unknown[] = [];
    const cyclic = { children, type: "p" };
    children.push(cyclic);
    expect(isPlateValue([cyclic])).toBe(false);
  });

  it("bounds wide documents", () => {
    expect(
      isPlateValue([
        {
          children: Array.from({ length: 10_000 }, () => ({ text: "" })),
          type: "p",
        },
      ])
    ).toBe(false);
  });
});
