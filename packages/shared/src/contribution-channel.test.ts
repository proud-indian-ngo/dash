import { describe, expect, it } from "vitest";

import {
  accountForChannel,
  channelAccountChoice,
  channelAccountIssue,
  defaultGiveDoAccount,
  isReportingModeFixed,
  keepsFixedAccount,
  reportingModeIssue,
} from "./contribution-channel";
import { contributionRuleIssues, defaultReportingMode } from "./income";

const BANK = { id: "bank", kind: "bank", name: "HDFC current" };
const BANK_2 = { id: "bank-2", kind: "bank", name: "SBI savings" };
const CASH = { id: "cash", kind: "cash", name: "Petty cash" };
const RAZORPAY = { id: "rzp", kind: "gateway_clearing", name: "Razorpay" };
const GIVE_DO = {
  id: "gd",
  kind: "gateway_clearing",
  name: "give.do clearing",
};
const DEPOSIT = { id: "fd", kind: "deposit", name: "Fixed deposit" };
const ACCOUNTS = [BANK, CASH, RAZORPAY, GIVE_DO, DEPOSIT];
const SETUP = { razorpayClearingAccountId: "rzp" };
const NO_RAZORPAY = { razorpayClearingAccountId: null };

const ids = (accounts: readonly { id: string }[]) => accounts.map((a) => a.id);

describe("reporting modes per channel", () => {
  it("fixes every channel but cheque to its default mode", () => {
    for (const channel of [
      "razorpay",
      "give_do",
      "upi",
      "neft",
      "cash",
      "in_kind",
    ] as const) {
      expect(isReportingModeFixed(channel)).toBe(true);
      expect(reportingModeIssue(channel, defaultReportingMode(channel))).toBe(
        null
      );
    }
    expect(isReportingModeFixed("cheque")).toBe(false);
    expect(defaultReportingMode("cheque")).toBe("electronic_or_account_payee");
  });

  it("lets a bearer cheque be reported as other, but never cash or in kind", () => {
    expect(reportingModeIssue("cheque", "other")).toBe(null);
    expect(reportingModeIssue("cheque", "cash")).toContain("A cheque gift");
    expect(reportingModeIssue("cheque", "in_kind")).toContain("A cheque gift");
  });

  it("refuses another mode for a fixed channel, in plain words", () => {
    expect(reportingModeIssue("upi", "other")).toBe(
      "A UPI gift is reported as electronic or account-payee cheque"
    );
    expect(reportingModeIssue("razorpay", "cash")).toBe(
      "A Razorpay gift is reported as electronic or account-payee cheque"
    );
    expect(reportingModeIssue("cash", "electronic_or_account_payee")).toBe(
      "A cash gift is reported as cash"
    );
  });

  it("is part of the contribution rules", () => {
    const issues = contributionRuleIssues({
      channel: "neft",
      donationType: "voluntary",
      orgAccountId: "bank",
      reportingMode: "cash",
    });
    expect(issues).toEqual([
      {
        message:
          "A NEFT/IMPS gift is reported as electronic or account-payee cheque",
        path: "reportingMode",
      },
    ]);
  });
});

describe("channelAccountIssue", () => {
  it("puts Razorpay gifts in the configured clearing account only", () => {
    expect(channelAccountIssue("razorpay", RAZORPAY, SETUP)).toBe(null);
    expect(channelAccountIssue("razorpay", GIVE_DO, SETUP)).toBe(
      "A Razorpay gift goes into the Razorpay clearing account"
    );
    expect(channelAccountIssue("razorpay", BANK, SETUP)).toBe(
      "A Razorpay gift goes into the Razorpay clearing account"
    );
    expect(channelAccountIssue("razorpay", RAZORPAY, NO_RAZORPAY)).toBe(
      "Choose the Razorpay clearing account in Settings first"
    );
  });

  it("puts give.do gifts in a clearing account other than Razorpay's", () => {
    expect(channelAccountIssue("give_do", GIVE_DO, SETUP)).toBe(null);
    for (const account of [RAZORPAY, BANK, CASH]) {
      expect(channelAccountIssue("give_do", account, SETUP)).toBe(
        "A give.do gift goes into the give.do clearing account"
      );
    }
  });

  it("puts UPI, NEFT and cheque gifts in a bank account", () => {
    expect(channelAccountIssue("upi", BANK, SETUP)).toBe(null);
    expect(channelAccountIssue("upi", RAZORPAY, SETUP)).toBe(
      "A UPI gift goes into a bank account"
    );
    expect(channelAccountIssue("neft", CASH, SETUP)).toBe(
      "A NEFT/IMPS gift goes into a bank account"
    );
    expect(channelAccountIssue("cheque", GIVE_DO, SETUP)).toBe(
      "A cheque gift goes into a bank account"
    );
  });

  it("puts cash in a bank or cash account, never a deposit", () => {
    expect(channelAccountIssue("cash", BANK, SETUP)).toBe(null);
    expect(channelAccountIssue("cash", CASH, SETUP)).toBe(null);
    expect(channelAccountIssue("cash", RAZORPAY, SETUP)).toBe(
      "A cash gift goes into a bank or cash account"
    );
    expect(channelAccountIssue("cash", DEPOSIT, SETUP)).not.toBe(null);
  });
});

describe("channelAccountChoice", () => {
  it("fixes Razorpay to its clearing account", () => {
    const choice = channelAccountChoice("razorpay", ACCOUNTS, SETUP);
    expect(ids(choice.allowed)).toEqual(["rzp"]);
    expect(choice.preferred?.id).toBe("rzp");
    expect(choice.fixed).toBe(true);
  });

  it("says to choose the Razorpay clearing account when none is set", () => {
    const choice = channelAccountChoice("razorpay", ACCOUNTS, NO_RAZORPAY);
    expect(choice.allowed).toEqual([]);
    expect(choice.fixed).toBe(false);
    expect(choice.emptyReason).toBe(
      "Choose the Razorpay clearing account in Settings first."
    );
  });

  it("fixes give.do to the clearing account named for it", () => {
    const other = { id: "gw", kind: "gateway_clearing", name: "PayU" };
    const choice = channelAccountChoice("give_do", [...ACCOUNTS, other], SETUP);
    expect(ids(choice.allowed)).toEqual(["gd", "gw"]);
    expect(choice.preferred?.id).toBe("gd");
    expect(choice.fixed).toBe(true);
    // Without one named for give.do, the only other clearing account.
    const unnamed = channelAccountChoice("give_do", [RAZORPAY, other], SETUP);
    expect(unnamed.preferred?.id).toBe("gw");
    expect(unnamed.fixed).toBe(true);
  });

  it("offers bank accounts for UPI, NEFT and cheque, auto-picking a sole one", () => {
    for (const channel of ["upi", "neft", "cheque"] as const) {
      const choice = channelAccountChoice(channel, ACCOUNTS, SETUP);
      expect(ids(choice.allowed)).toEqual(["bank"]);
      expect(choice.preferred?.id).toBe("bank");
      expect(choice.fixed).toBe(false);
    }
    const two = channelAccountChoice("upi", [...ACCOUNTS, BANK_2], SETUP);
    expect(ids(two.allowed)).toEqual(["bank", "bank-2"]);
    expect(two.preferred).toBeUndefined();
  });

  it("offers bank and cash accounts for cash", () => {
    const choice = channelAccountChoice("cash", ACCOUNTS, SETUP);
    expect(ids(choice.allowed)).toEqual(["bank", "cash"]);
    expect(choice.preferred).toBeUndefined();
    expect(
      channelAccountChoice("cash", [BANK, RAZORPAY], SETUP).preferred?.id
    ).toBe("bank");
  });

  it("offers no account for an in-kind gift", () => {
    expect(channelAccountChoice("in_kind", ACCOUNTS, SETUP)).toEqual({
      allowed: [],
      emptyReason: null,
      fixed: false,
      preferred: undefined,
    });
  });
});

describe("accountForChannel", () => {
  const accounts = [...ACCOUNTS, BANK_2];

  it("moves to the gateway's account for a gateway channel", () => {
    expect(accountForChannel("razorpay", "bank", accounts, SETUP)).toBe("rzp");
    expect(accountForChannel("give_do", "rzp", accounts, SETUP)).toBe("gd");
  });

  it("keeps an account that still fits, and clears one that does not", () => {
    expect(accountForChannel("upi", "bank-2", accounts, SETUP)).toBe("bank-2");
    expect(accountForChannel("cash", "bank-2", accounts, SETUP)).toBe("bank-2");
    expect(accountForChannel("upi", "rzp", accounts, SETUP)).toBeUndefined();
    expect(accountForChannel("upi", "cash", accounts, SETUP)).toBeUndefined();
  });

  it("picks the only allowed account when the current one does not fit", () => {
    expect(accountForChannel("neft", "rzp", ACCOUNTS, SETUP)).toBe("bank");
    expect(accountForChannel("upi", undefined, ACCOUNTS, SETUP)).toBe("bank");
  });

  it("clears the account for an in-kind gift", () => {
    expect(accountForChannel("in_kind", "bank", ACCOUNTS, SETUP)).toBe(
      undefined
    );
  });
});

describe("defaultGiveDoAccount", () => {
  it("finds the gateway clearing account named for give.do", () => {
    expect(defaultGiveDoAccount(ACCOUNTS)?.id).toBe("gd");
    expect(defaultGiveDoAccount([BANK, RAZORPAY])).toBeUndefined();
  });
});

describe("keepsFixedAccount", () => {
  const stored = { channel: "razorpay", orgAccountId: "bank" };

  it("keeps the stored channel and account only while locked", () => {
    expect(keepsFixedAccount(true, { ...stored }, stored)).toBe(true);
    expect(keepsFixedAccount(false, { ...stored }, stored)).toBe(false);
    expect(keepsFixedAccount(true, { ...stored }, null)).toBe(false);
  });

  it("checks a changed channel or account", () => {
    expect(
      keepsFixedAccount(true, { channel: "upi", orgAccountId: "bank" }, stored)
    ).toBe(false);
    expect(
      keepsFixedAccount(
        true,
        { channel: "razorpay", orgAccountId: "rzp" },
        stored
      )
    ).toBe(false);
  });
});
