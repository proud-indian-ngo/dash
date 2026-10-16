import { describe, expect, it } from "vitest";

import { LEDGER_ACCOUNT_HEAD_IDS } from "./constants";
import { provisionHeadOf, provisionOutstandingText } from "./provisions";

describe("provisions", () => {
  it("knows only the audit fee provision", () => {
    expect(provisionHeadOf(LEDGER_ACCOUNT_HEAD_IDS.auditFeesPayable)).toEqual(
      expect.objectContaining({
        excessHeadId: LEDGER_ACCOUNT_HEAD_IDS.auditFees,
        label: "Audit fees payable (provision)",
      })
    );
    expect(provisionHeadOf(LEDGER_ACCOUNT_HEAD_IDS.claimsPayable)).toBeNull();
    expect(provisionHeadOf(null)).toBeNull();
  });

  it("says what is outstanding and the years it is from", () => {
    expect(
      provisionOutstandingText({ paise: 7500_00, years: ["2025-26"] })
    ).toBe("₹7,500.00 outstanding from FY 2025-26");
    expect(
      provisionOutstandingText({
        paise: 8500_00,
        years: ["2025-26", "2026-27"],
      })
    ).toBe("₹8,500.00 outstanding from FY 2025-26 and FY 2026-27");
    expect(provisionOutstandingText({ paise: 0, years: [] })).toBe(
      "Nothing outstanding"
    );
  });
});
