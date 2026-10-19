import { describe, expect, it } from "bun:test";

import {
  formatIndiaTime,
  maskPhone,
  receiptPersonName,
} from "./notification-delivery";

describe("formatIndiaTime", () => {
  it("shows India time whatever the browser's zone", () => {
    expect(formatIndiaTime(Date.UTC(2026, 9, 19, 4, 10))).toBe(
      "19 Oct 2026, 9:40 am"
    );
  });
});

describe("receiptPersonName", () => {
  const jid = "919876543686@s.whatsapp.net";

  it("prefers the dashboard user", () => {
    expect(receiptPersonName(jid, "Asha K", "Asha Kumar")).toBe("Asha Kumar");
  });

  it("uses GoWA's display name when it isn't a number", () => {
    expect(receiptPersonName(jid, "Asha K", null)).toBe("Asha K");
  });

  it("masks the number when the display name is one", () => {
    expect(receiptPersonName(jid, "+91 98765 43686", null)).toBe(
      "+91 •••• ••686"
    );
    expect(receiptPersonName(jid, null, null)).toBe("+91 •••• ••686");
  });

  it("names a LID it can't match as unknown", () => {
    expect(receiptPersonName("251556368777322@lid", null, null)).toBe(
      "Unknown number"
    );
  });

  it("masks a ten-digit number without a country code", () => {
    expect(maskPhone("9876543686")).toBe("•••• ••686");
  });
});
