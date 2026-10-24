import { describe, expect, it } from "bun:test";

import { isSpreadsheetSafeCsv } from "./csv-formula-safety";

const bytes = (value: string) => new TextEncoder().encode(value);

describe("isSpreadsheetSafeCsv", () => {
  it.each(["=1+1", "+1+1", "-1+1", "@SUM(A1)", "\t=1+1", "\r=1+1"])(
    "rejects a stored formula-leading cell in %j",
    (value) => {
      expect(
        isSpreadsheetSafeCsv(
          bytes(`Name,Address\nAsha Rao,"${value.replaceAll('"', '""')}"`)
        )
      ).toBe(false);
    }
  );

  it("accepts an ordinary generated filing and handles quoted commas", () => {
    expect(
      isSpreadsheetSafeCsv(bytes('Name,Address\nAsha Rao,"Flat 2, Rose Villa"'))
    ).toBe(true);
  });

  it("fails closed when stored bytes are malformed or not UTF-8", () => {
    expect(isSpreadsheetSafeCsv(bytes('Name\n"unclosed'))).toBe(false);
    expect(isSpreadsheetSafeCsv(new Uint8Array([0xff, 0xfe]))).toBe(false);
  });
});
