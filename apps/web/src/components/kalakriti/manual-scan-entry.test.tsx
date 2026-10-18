import { describe, expect, it } from "bun:test";

import { normalizeManualScanId } from "./manual-scan-entry";

describe("normalizeManualScanId", () => {
  it("upper-cases yearly IDs that phone keyboards capitalise or lower", () => {
    expect(normalizeManualScanId(" kal-2027-0001 ")).toBe("KAL-2027-0001");
    expect(normalizeManualScanId("Kalv-2027-0012")).toBe("KALV-2027-0012");
  });

  it("lower-cases record IDs, which are stored lower case", () => {
    expect(normalizeManualScanId("019F0000-0112-7000-8000-00000000000A")).toBe(
      "019f0000-0112-7000-8000-00000000000a"
    );
  });
});
