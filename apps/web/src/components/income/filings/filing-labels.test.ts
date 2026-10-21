import { describe, expect, it } from "bun:test";

import type { FilingRowView } from "@pi-dash/db/queries/donation-filings";

import {
  canSendRow,
  certificateStatus,
  emailableCount,
  manualSendRows,
} from "./filing-labels";

const NOW = Date.UTC(2027, 4, 1, 6);
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000);

const row = (
  certificate: Partial<NonNullable<FilingRowView["certificate"]>> | null,
  overrides: Partial<FilingRowView> = {}
): FilingRowView => ({
  amountPaise: 100_000,
  certificate: certificate
    ? {
        acknowledgementNumber: "114000000000001",
        confirmedAt: minutesAgo(600),
        emailedAt: null,
        emailFailure: null,
        emailQueuedAt: null,
        fileName: "Form-114-114000000000001.pdf",
        id: "c1",
        matchedBy: "details",
        ...certificate,
      }
    : null,
  donationTypeCode: "Specific grant",
  drift: [],
  emailState: "ok",
  giftCount: 1,
  id: "r1",
  idCode: "Permanent Account Number",
  idNumberLast4: "234E",
  modeCode: "Cash",
  name: "Asha Rao",
  partyId: "p1",
  srNo: 1,
  ...overrides,
});

describe("certificate status", () => {
  it("holds a details match for review: never emailed or sent by hand until confirmed", () => {
    const pending = row({ confirmedAt: null, matchedBy: "details" });
    expect(certificateStatus(pending, NOW).label).toBe("Needs review");
    expect(emailableCount([pending], NOW)).toBe(0);
    expect(canSendRow(pending, NOW)).toBe(false);
    expect(manualSendRows([{ ...pending, emailState: "none" }])).toHaveLength(
      0
    );
  });

  it("hides Send email while a request is on its way, and offers it again once stuck", () => {
    const sending = row({ emailQueuedAt: minutesAgo(5) });
    expect(certificateStatus(sending, NOW).label).toBe("Sending");
    expect(canSendRow(sending, NOW)).toBe(false);
    expect(emailableCount([sending], NOW)).toBe(0);

    const stuck = row({ emailQueuedAt: minutesAgo(61) });
    expect(certificateStatus(stuck, NOW).label).toBe("Stuck, send again");
    expect(canSendRow(stuck, NOW)).toBe(true);
    expect(emailableCount([stuck], NOW)).toBe(1);

    const failed = row({
      emailFailure: "failed",
      emailQueuedAt: minutesAgo(5),
    });
    expect(canSendRow(failed, NOW)).toBe(true);
    expect(emailableCount([failed], NOW)).toBe(1);
  });
});
