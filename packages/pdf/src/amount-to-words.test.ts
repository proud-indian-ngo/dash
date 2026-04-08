import { describe, expect, it } from "vitest";
import { amountToWords } from "./amount-to-words";

describe("amountToWords", () => {
  it("converts 0 to words", () => {
    expect(amountToWords(0)).toBe("Rupees Zero Only");
  });

  it("converts 1 to words", () => {
    expect(amountToWords(1)).toBe("Rupees One Only");
  });

  it("converts 10 to words", () => {
    expect(amountToWords(10)).toBe("Rupees Ten Only");
  });

  it("converts 100 to words", () => {
    expect(amountToWords(100)).toBe("Rupees One Hundred Only");
  });

  it("converts 500 to words", () => {
    expect(amountToWords(500)).toBe("Rupees Five Hundred Only");
  });

  it("converts 850.50 to words with paise", () => {
    expect(amountToWords(850.5)).toBe(
      "Rupees Eight Hundred Fifty and Paise Fifty Only"
    );
  });

  it("converts 999.99 to words with paise", () => {
    expect(amountToWords(999.99)).toBe(
      "Rupees Nine Hundred Ninety Nine and Paise Ninety Nine Only"
    );
  });

  it("converts 1000 to words", () => {
    expect(amountToWords(1000)).toBe("Rupees One Thousand Only");
  });
});
