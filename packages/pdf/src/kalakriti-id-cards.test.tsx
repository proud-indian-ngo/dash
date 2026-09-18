import { describe, expect, it } from "bun:test";

import { generateBlankKalakritiIdCards } from "./generate-blank-kalakriti-id-cards";
import { generateKalakritiIdCards } from "./generate-kalakriti-id-cards";
import { fitIdCardText } from "./kalakriti-id-card-layout";
import {
  kalakritiIdCardSheet,
  type KalakritiIdCardData,
} from "./kalakriti-id-cards";

const guest: KalakritiIdCardData = {
  id: "01900000-0000-7000-8000-000000000005",
  type: "guest",
  name: "Ananya Iyer",
};

describe("Kalakriti printable ID cards", () => {
  it("tiles four cards edge-to-edge on A4 so two through-cuts separate them", () => {
    expect(kalakritiIdCardSheet.gutterMm).toBe(0);
    expect(kalakritiIdCardSheet.marginXMm).toBe(0);
    expect(kalakritiIdCardSheet.marginYMm).toBe(0);
    expect(kalakritiIdCardSheet.cutXMm).toEqual([0, 105, 210]);
    expect(kalakritiIdCardSheet.cutYMm).toEqual([0, 148.5, 297]);
    expect(kalakritiIdCardSheet.cardWidthMm * 2).toBe(
      kalakritiIdCardSheet.pageWidthMm
    );
    expect(kalakritiIdCardSheet.cardHeightMm * 2).toBe(
      kalakritiIdCardSheet.pageHeightMm
    );
  });

  it("prints the requested whole blank pages per type", async () => {
    const pages = { volunteerPages: 1, guestPages: 2, judgePages: 1 };
    const first = await generateBlankKalakritiIdCards(pages);
    expect([
      ...first
        .toString("latin1")
        .matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g),
    ]).toHaveLength(4);
  });
  it("rejects invalid blank page counts before rendering", async () => {
    for (const volunteerPages of [-1, 0, 0.5, 101, Number.NaN]) {
      await expect(
        generateBlankKalakritiIdCards({
          volunteerPages,
          guestPages: 0,
          judgePages: 0,
        })
      ).rejects.toThrow("Choose between");
    }
  });
  it("keeps a partially filled final page at A4 size", async () => {
    const pdf = await generateKalakritiIdCards(
      Array.from({ length: 5 }, () => guest)
    );
    const boxes = [
      ...pdf
        .toString("latin1")
        .matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g),
    ];
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect(Number(box[1])).toBeCloseTo(595.28, 1);
      expect(Number(box[2])).toBeCloseTo(841.89, 1);
    }
  });

  it("rejects invalid scanner identifiers", async () => {
    await expect(
      generateKalakritiIdCards([{ ...guest, id: "not-a-uuid" }])
    ).rejects.toThrow("Invalid person QR");
  });

  it("rejects empty print runs", async () => {
    await expect(generateKalakritiIdCards([])).rejects.toThrow(
      "Select at least one person"
    );
  });

  it("fits long names and a four-competition schedule without shrinking the QR", () => {
    const fitted = fitIdCardText({
      id: guest.id,
      type: "student",
      name: "Ananya Krishnamurthy",
      centerName: "Sunshine Learning Centre",
      competitions: Array.from({ length: 4 }, () => ({
        name: "Classical Dance",
        startsAt: null,
      })),
    });
    expect(fitted.competitions).toHaveLength(4);
    expect(fitted.details.join(" ")).toBe("Sunshine Learning Centre");
    expect(fitted.name.join(" ")).toBe("Ananya Krishnamurthy");
  });

  it("refuses oversized text instead of silently hiding it under the QR", () => {
    expect(() =>
      fitIdCardText({
        ...guest,
        type: "guardian",
        centerName: "A very long center name ".repeat(30),
      })
    ).toThrow("do not fit");
  });
});
