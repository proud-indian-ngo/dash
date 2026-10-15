import { describe, expect, it } from "vitest";

import {
  assertSafePaise,
  formatPaise,
  MAX_AMOUNT_PAISE,
  paiseSchema,
  paiseToRupees,
  positivePaiseSchema,
  rupeesToPaise,
  sumPaise,
  tryRupeesToPaise,
} from "./money";

describe("rupeesToPaise", () => {
  it("parses rupee strings exactly", () => {
    expect(rupeesToPaise("19.99")).toBe(1999);
    expect(rupeesToPaise("0.1")).toBe(10);
    expect(rupeesToPaise("0.01")).toBe(1);
    expect(rupeesToPaise("250")).toBe(25_000);
    expect(rupeesToPaise(" 1234567.89 ")).toBe(123_456_789);
    expect(rupeesToPaise("007.50")).toBe(750);
    expect(rupeesToPaise("-12.5")).toBe(-1250);
    expect(rupeesToPaise("-0")).toBe(0);
  });

  it("accepts a bare leading or trailing decimal point", () => {
    expect(rupeesToPaise("5.")).toBe(500);
    expect(rupeesToPaise(".5")).toBe(50);
    expect(rupeesToPaise(".05")).toBe(5);
    expect(rupeesToPaise("-.5")).toBe(-50);
  });

  it("parses numbers through their decimal form", () => {
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(rupeesToPaise(0.29)).toBe(29);
    expect(rupeesToPaise(1005)).toBe(100_500);
  });

  it("rejects more than two decimals and non-numeric input", () => {
    for (const bad of [
      "1.234",
      "",
      " ",
      "abc",
      "1e3",
      "1,000",
      ".",
      "-",
      "-.",
      ".123",
      "₹5",
      "NaN",
    ]) {
      expect(() => rupeesToPaise(bad)).toThrow(RangeError);
    }
    expect(() => rupeesToPaise(0.1 + 0.2)).toThrow(RangeError);
    expect(() => rupeesToPaise(1.005 * 1000)).toThrow(RangeError);
    expect(() => rupeesToPaise(Number.NaN)).toThrow(RangeError);
    expect(() => rupeesToPaise(1e21)).toThrow(RangeError);
  });

  it("rejects amounts outside the safe-integer range", () => {
    expect(rupeesToPaise("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => rupeesToPaise("90071992547409.92")).toThrow(RangeError);
    expect(() => rupeesToPaise("100000000000000000")).toThrow(RangeError);
  });
});

describe("tryRupeesToPaise", () => {
  it("returns null instead of throwing", () => {
    expect(tryRupeesToPaise("19.99")).toBe(1999);
    expect(tryRupeesToPaise("1.234")).toBeNull();
    expect(tryRupeesToPaise("")).toBeNull();
  });
});

describe("paiseToRupees", () => {
  it("formats a fixed two-decimal string", () => {
    expect(paiseToRupees(1999)).toBe("19.99");
    expect(paiseToRupees(500_000)).toBe("5000.00");
    expect(paiseToRupees(5)).toBe("0.05");
    expect(paiseToRupees(0)).toBe("0.00");
    expect(paiseToRupees(-1250)).toBe("-12.50");
    expect(paiseToRupees(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91");
  });

  it("round-trips with rupeesToPaise", () => {
    for (const paise of [0, 1, 99, 100, 1999, 123_456_789]) {
      expect(rupeesToPaise(paiseToRupees(paise))).toBe(paise);
    }
  });

  it("rejects unsafe or fractional paise", () => {
    expect(() => paiseToRupees(1.5)).toThrow(RangeError);
    expect(() => paiseToRupees(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      RangeError
    );
  });
});

describe("formatPaise", () => {
  it("matches the app's INR display", () => {
    expect(formatPaise(123_456_78)).toBe("₹1,23,456.78");
    expect(formatPaise(500_000)).toBe("₹5,000.00");
    expect(formatPaise(0)).toBe("₹0.00");
    expect(formatPaise(1999)).toBe(
      new Intl.NumberFormat("en-IN", {
        currency: "INR",
        style: "currency",
      }).format(19.99)
    );
  });

  it("formats large amounts exactly", () => {
    expect(formatPaise(Number.MAX_SAFE_INTEGER)).toBe(
      "₹9,00,71,99,25,47,409.91"
    );
  });
});

describe("sumPaise and schemas", () => {
  it("sums integers and guards the total", () => {
    expect(sumPaise([1999, 1, 500_000])).toBe(502_000);
    expect(sumPaise([])).toBe(0);
    expect(() => sumPaise([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
    expect(() => assertSafePaise(0.5)).toThrow(RangeError);
  });

  it("validates paise inputs", () => {
    expect(paiseSchema.safeParse(0).success).toBe(true);
    expect(paiseSchema.safeParse(-1).success).toBe(false);
    expect(paiseSchema.safeParse(1.5).success).toBe(false);
    expect(paiseSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(
      false
    );
    expect(positivePaiseSchema.safeParse(0).success).toBe(false);
    expect(positivePaiseSchema.safeParse(1).success).toBe(true);
  });

  it("caps amounts at the old numeric(12,2) limit", () => {
    expect(rupeesToPaise("9999999999.99")).toBe(MAX_AMOUNT_PAISE);
    expect(paiseSchema.safeParse(MAX_AMOUNT_PAISE).success).toBe(true);
    expect(positivePaiseSchema.safeParse(MAX_AMOUNT_PAISE).success).toBe(true);
    expect(paiseSchema.safeParse(MAX_AMOUNT_PAISE + 1).success).toBe(false);
    expect(positivePaiseSchema.safeParse(MAX_AMOUNT_PAISE + 1).success).toBe(
      false
    );
  });

  it("sums and formats a total of many max-value items", () => {
    const total = sumPaise(Array.from({ length: 50 }, () => MAX_AMOUNT_PAISE));
    expect(total).toBe(49_999_999_999_950);
    expect(formatPaise(total)).toBe("₹4,99,99,99,99,999.50");
  });
});
