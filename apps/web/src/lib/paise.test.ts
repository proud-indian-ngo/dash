import { describe, expect, it } from "bun:test";

import {
  formatPaise,
  isValidRupeesInput,
  paiseToRupeesInput,
  rupeesToPaise,
} from "./paise";

describe("paise helpers", () => {
  it("formats whole rupees without decimals and fractions with two", () => {
    expect(formatPaise(1_200_000)).toBe("₹12,000");
    expect(formatPaise(1_200_050)).toBe("₹12,000.50");
    expect(formatPaise(0)).toBe("₹0");
  });

  it("converts rupee input to paise and back", () => {
    expect(rupeesToPaise("250")).toBe(25_000);
    expect(rupeesToPaise("250.75")).toBe(25_075);
    expect(rupeesToPaise("0.1")).toBe(10);
    expect(rupeesToPaise("  ")).toBeNull();
    expect(paiseToRupeesInput(25_000)).toBe("250");
    expect(paiseToRupeesInput(25_075)).toBe("250.75");
    expect(paiseToRupeesInput(null)).toBe("");
  });

  it("validates rupee input bounds", () => {
    expect(isValidRupeesInput("")).toBe(true);
    expect(isValidRupeesInput("10000")).toBe(true);
    expect(isValidRupeesInput("10000.5")).toBe(true);
    expect(isValidRupeesInput("-5")).toBe(false);
    expect(isValidRupeesInput("1.234")).toBe(false);
    expect(isValidRupeesInput("99999999999")).toBe(false);
  });
});
