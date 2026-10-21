import { describe, expect, it, mock } from "bun:test";

import QRCode from "qrcode";

mock.module("@pi-dash/env/server", () => ({
  env: {
    APP_URL: "https://dash.example.org/",
    BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
    BETTER_AUTH_URL: "https://auth.example.org",
  },
}));

const { isReceiptVerifySignature, receiptVerifyUrl } =
  await import("./receipt-verification");

const RECEIPT_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

function sigOf(url: string): string {
  return new URL(url).searchParams.get("s") ?? "";
}

describe("receipt verification links", () => {
  it("links to the receipt's page on the app origin", () => {
    const url = new URL(receiptVerifyUrl(RECEIPT_ID));
    expect(`${url.origin}${url.pathname}`).toBe(
      `https://dash.example.org/verify/r/${RECEIPT_ID}`
    );
  });

  it("keeps the production link at QR version 6, about 0.5 mm modules", () => {
    const url = receiptVerifyUrl(RECEIPT_ID).replace(
      "https://dash.example.org",
      "https://dash.proudindian.ngo"
    );
    const { version } = QRCode.create(url, { errorCorrectionLevel: "M" });
    expect(version).toBeLessThanOrEqual(6);
  });

  it("accepts its own signature, whatever the ID's case", () => {
    const sig = sigOf(receiptVerifyUrl(RECEIPT_ID.toUpperCase()));
    expect(isReceiptVerifySignature(RECEIPT_ID, sig)).toBe(true);
    expect(isReceiptVerifySignature(RECEIPT_ID.toUpperCase(), sig)).toBe(true);
  });

  it("refuses another receipt's signature and malformed ones", () => {
    const other = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c";
    const sig = sigOf(receiptVerifyUrl(other));
    expect(isReceiptVerifySignature(RECEIPT_ID, sig)).toBe(false);
    expect(isReceiptVerifySignature(RECEIPT_ID, "")).toBe(false);
    const own = sigOf(receiptVerifyUrl(RECEIPT_ID));
    expect(isReceiptVerifySignature(RECEIPT_ID, `${own}A`)).toBe(false);
    expect(isReceiptVerifySignature(RECEIPT_ID, own.slice(0, -1))).toBe(false);
  });
});
