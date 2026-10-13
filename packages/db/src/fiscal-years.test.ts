import { describe, expect, it } from "vitest";

import {
  buildFiscalPeriods,
  fiscalYearLabel,
  fiscalYearStartFor,
} from "./fiscal-years";

describe("fiscal year helpers", () => {
  it("names the April-to-March year by its starting calendar year", () => {
    expect(fiscalYearStartFor(new Date(2026, 3, 1))).toBe(2026);
    expect(fiscalYearStartFor(new Date(2027, 2, 31))).toBe(2026);
    expect(fiscalYearStartFor(new Date(2027, 0, 15))).toBe(2026);
    expect(fiscalYearLabel(2026)).toBe("2026-27");
    expect(fiscalYearLabel(2099)).toBe("2099-00");
  });

  it("builds twelve periods from April to March with correct month ends", () => {
    const periods = buildFiscalPeriods(2026, "fy", (m) => `p${m}`);
    expect(periods).toHaveLength(12);
    expect(periods[0]).toMatchObject({
      endsOn: "2026-04-30",
      month: 1,
      startsOn: "2026-04-01",
    });
    expect(periods[10]).toMatchObject({
      endsOn: "2027-02-28",
      month: 11,
      startsOn: "2027-02-01",
    });
    expect(periods[11]).toMatchObject({
      endsOn: "2027-03-31",
      month: 12,
      startsOn: "2027-03-01",
    });
    expect(buildFiscalPeriods(2027, "fy", (m) => `p${m}`)[10]?.endsOn).toBe(
      "2028-02-29"
    );
  });
});
