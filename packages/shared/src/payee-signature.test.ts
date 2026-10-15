import { describe, expect, it } from "vitest";

import {
  PAYEE_SIGNATURE_MAX_BYTES,
  payeeSignatureImageProblem,
  payeeSignatureStatement,
  signatureExpenseDay,
} from "./payee-signature";

// Synthetic details only.
const facts = {
  amountPaise: 50_000,
  categoryName: "Labour",
  description: "Cleaning the community hall",
  expenseDate: "2026-10-12",
  payeeName: "Test Payee",
};

describe("payeeSignatureStatement", () => {
  it("names the payee, amount, purpose and day", () => {
    expect(payeeSignatureStatement(facts)).toBe(
      "I, Test Payee, received ₹500 from Proud Indian for Cleaning the community hall on 12 Oct 2026."
    );
  });

  it("prints paise when the amount has them", () => {
    expect(
      payeeSignatureStatement({ ...facts, amountPaise: 99_950 })
    ).toContain("received ₹999.50 from");
  });

  it("falls back to the category without a description", () => {
    expect(payeeSignatureStatement({ ...facts, description: "  " })).toContain(
      "for Labour on"
    );
  });

  it("drops a trailing full stop and folds spaces", () => {
    expect(
      payeeSignatureStatement({
        ...facts,
        description: "Moving  chairs\nand tables.",
      })
    ).toContain("for Moving chairs and tables on 12 Oct 2026.");
  });

  it("reads an epoch expense date as the day in India", () => {
    // 11 Oct 2026, 20:00 UTC is 12 Oct in India.
    const epoch = Date.UTC(2026, 9, 11, 20, 0);
    expect(signatureExpenseDay(epoch)).toBe("2026-10-12");
    expect(payeeSignatureStatement({ ...facts, expenseDate: epoch })).toBe(
      payeeSignatureStatement(facts)
    );
  });
});

/** The start of a PNG declaring these header fields; no pixels follow. */
function pngHead(
  width: number,
  height: number,
  { bitDepth = 8, colourType = 6, interlace = 0 } = {}
): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = bitDepth;
  bytes[25] = colourType;
  bytes[28] = interlace;
  return bytes;
}

describe("payeeSignatureImageProblem", () => {
  it("accepts a cropped signature as RGBA or RGB", () => {
    expect(payeeSignatureImageProblem(pngHead(480, 160))).toBeNull();
    expect(
      payeeSignatureImageProblem(pngHead(1200, 600, { colourType: 2 }))
    ).toBeNull();
  });

  it("refuses huge dimensions declared in a small file", () => {
    expect(payeeSignatureImageProblem(pngHead(6000, 6000))).toBe("too_large");
    expect(payeeSignatureImageProblem(pngHead(10_000, 10_000))).toBe(
      "too_large"
    );
    expect(payeeSignatureImageProblem(pngHead(1201, 100))).toBe("too_large");
    expect(payeeSignatureImageProblem(pngHead(400, 601))).toBe("too_large");
  });

  it("refuses a file over the byte cap", () => {
    expect(
      payeeSignatureImageProblem(
        pngHead(480, 160),
        PAYEE_SIGNATURE_MAX_BYTES + 1
      )
    ).toBe("too_large");
  });

  it("refuses a blank 1×1 or a sliver", () => {
    expect(payeeSignatureImageProblem(pngHead(1, 1))).toBe("too_small");
    expect(payeeSignatureImageProblem(pngHead(400, 8))).toBe("too_small");
    expect(payeeSignatureImageProblem(pngHead(40, 40))).toBe("too_small");
  });

  it("refuses other colour types, depths and interlacing", () => {
    for (const options of [
      { colourType: 3 },
      { colourType: 0 },
      { colourType: 4 },
      { bitDepth: 16 },
      { interlace: 1 },
    ]) {
      expect(payeeSignatureImageProblem(pngHead(480, 160, options))).toBe(
        "unsupported_format"
      );
    }
  });

  it("refuses bytes that aren't a PNG", () => {
    const jpeg = new Uint8Array(64).fill(0xff);
    expect(payeeSignatureImageProblem(jpeg)).toBe("not_png");
    expect(payeeSignatureImageProblem(new Uint8Array(0))).toBe("not_png");
  });
});
