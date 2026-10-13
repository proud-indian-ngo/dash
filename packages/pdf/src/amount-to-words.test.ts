import { describe, expect, it } from "bun:test";

import { paiseToWords } from "./amount-to-words";

describe("paiseToWords", () => {
  it("converts 0 to words", () => {
    expect(paiseToWords(0)).toBe("Rupees Zero Only");
  });

  it("converts 1 to words", () => {
    expect(paiseToWords(100)).toBe("Rupees One Only");
  });

  it("converts 10 to words", () => {
    expect(paiseToWords(1000)).toBe("Rupees Ten Only");
  });

  it("converts 100 to words", () => {
    expect(paiseToWords(10000)).toBe("Rupees One Hundred Only");
  });

  it("converts 500 to words", () => {
    expect(paiseToWords(50000)).toBe("Rupees Five Hundred Only");
  });

  it("converts 850.50 to words with paise", () => {
    expect(paiseToWords(85050)).toBe(
      "Rupees Eight Hundred Fifty and Paise Fifty Only"
    );
  });

  it("converts 999.99 to words with paise", () => {
    expect(paiseToWords(99999)).toBe(
      "Rupees Nine Hundred Ninety Nine and Paise Ninety Nine Only"
    );
  });

  it("converts 1000 to words", () => {
    expect(paiseToWords(100000)).toBe("Rupees One Thousand Only");
  });
});
