import { describe, expect, it } from "vitest";

import {
  DEFAULT_CASH_VOUCHER_LIMIT_PAISE,
  isIndianMobile,
  isLatinName,
  isValidCashVoucherLimitPaise,
  isValidCashVoucherLimitValue,
  MAX_CASH_VOUCHER_LIMIT_PAISE,
  parseCashVoucherLimit,
  qualifiesForCashVoucher,
} from "./cash-voucher";

describe("cash voucher limit", () => {
  it("defaults to ₹1,000 when unset or invalid", () => {
    expect(DEFAULT_CASH_VOUCHER_LIMIT_PAISE).toBe(100_000);
    expect(parseCashVoucherLimit(undefined)).toBe(100_000);
    expect(parseCashVoucherLimit(null)).toBe(100_000);
    expect(parseCashVoucherLimit("")).toBe(100_000);
    expect(parseCashVoucherLimit("abc")).toBe(100_000);
    expect(parseCashVoucherLimit("12.5")).toBe(100_000);
  });

  it("reads a stored limit", () => {
    expect(parseCashVoucherLimit("200000")).toBe(200_000);
    expect(parseCashVoucherLimit("100")).toBe(100);
  });

  it("never lifts the limit above the ₹10,000 cap", () => {
    expect(MAX_CASH_VOUCHER_LIMIT_PAISE).toBe(1_000_000);
    expect(parseCashVoucherLimit("1000000")).toBe(1_000_000);
    expect(parseCashVoucherLimit("1000100")).toBe(100_000);
    expect(parseCashVoucherLimit("99")).toBe(100_000);
  });

  it("accepts ₹1 to ₹10,000 in whole paise", () => {
    expect(isValidCashVoucherLimitPaise(100)).toBe(true);
    expect(isValidCashVoucherLimitPaise(1_000_000)).toBe(true);
    expect(isValidCashVoucherLimitPaise(99)).toBe(false);
    expect(isValidCashVoucherLimitPaise(1_000_001)).toBe(false);
    expect(isValidCashVoucherLimitPaise(150.5)).toBe(false);
    expect(isValidCashVoucherLimitValue("1000000")).toBe(true);
    expect(isValidCashVoucherLimitValue("1000100")).toBe(false);
    expect(isValidCashVoucherLimitValue("-100")).toBe(false);
    expect(isValidCashVoucherLimitValue("1e5")).toBe(false);
  });

  it("qualifies items up to the limit", () => {
    expect(qualifiesForCashVoucher(100_000, 100_000)).toBe(true);
    expect(qualifiesForCashVoucher(1, 100_000)).toBe(true);
    expect(qualifiesForCashVoucher(100_001, 100_000)).toBe(false);
    expect(qualifiesForCashVoucher(0, 100_000)).toBe(false);
    expect(qualifiesForCashVoucher(200_000, 200_000)).toBe(true);
  });
});

describe("isIndianMobile", () => {
  it("accepts +91 numbers starting 6 to 9", () => {
    expect(isIndianMobile("+919876543210")).toBe(true);
    expect(isIndianMobile("+916000000000")).toBe(true);
  });

  it("refuses landlines, other countries and loose formats", () => {
    expect(isIndianMobile("+915876543210")).toBe(false);
    expect(isIndianMobile("+14155550123")).toBe(false);
    expect(isIndianMobile("9876543210")).toBe(false);
    expect(isIndianMobile("+91 98765 43210")).toBe(false);
    expect(isIndianMobile("+9198765432101")).toBe(false);
  });
});

describe("isLatinName", () => {
  it("accepts English and IAST letters, digits and . ' - & / , ( )", () => {
    for (const name of [
      "Ramesh Kumar",
      "Kṛṣṇa Veṅkaṭeśa",
      "D'Souza",
      "A. R. Rahman",
      "Mary-Ann",
      "M/s Sharma & Sons",
      "Ramesh (driver)",
      "Shop 12, MG Road",
      // Decomposed: K r + U+0323 ṣ…, as some keyboards type it.
      "Kr\u0323s\u0323n\u0323a",
    ]) {
      expect(isLatinName(name)).toBe(true);
    }
  });

  it("refuses other scripts and stray symbols", () => {
    for (const name of ["रमेश", "ரமேஷ்", "Ramesh@", "×", "Ramesh #2"]) {
      expect(isLatinName(name)).toBe(false);
    }
  });
});
