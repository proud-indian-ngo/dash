import { describe, expect, it } from "vitest";

import {
  CORPUS_FUND_ID,
  FISCAL_YEAR_IDS,
  GIVE_INDIA_PARTY_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "./constants";

describe("fixed books IDs", () => {
  it("gives every reference account head its own ID", () => {
    const ids = Object.values(LEDGER_ACCOUNT_HEAD_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shares no ID between heads, years, the corpus fund and GiveIndia", () => {
    const ids = [
      ...Object.values(LEDGER_ACCOUNT_HEAD_IDS),
      ...Object.values(FISCAL_YEAR_IDS),
      CORPUS_FUND_ID,
      GIVE_INDIA_PARTY_ID,
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
