import { describe, expect, it } from "bun:test";

import { getStatusBadge } from "./status-badge";

describe("getStatusBadge", () => {
  it('maps pending to "Pending" label with "warning" tone', () => {
    expect(getStatusBadge("pending")).toEqual({
      label: "Pending",
      tone: "warning",
    });
  });

  it('maps approved to "Approved" label with "success" tone', () => {
    expect(getStatusBadge("approved")).toEqual({
      label: "Approved",
      tone: "success",
    });
  });

  it('maps rejected to "Rejected" label with "danger" tone', () => {
    expect(getStatusBadge("rejected")).toEqual({
      label: "Rejected",
      tone: "danger",
    });
  });

  it('maps partially_paid to "Partially Paid" with "warning" tone', () => {
    expect(getStatusBadge("partially_paid")).toEqual({
      label: "Partially Paid",
      tone: "warning",
    });
  });

  it('maps paid to "Paid" with "success" tone', () => {
    expect(getStatusBadge("paid")).toEqual({
      label: "Paid",
      tone: "success",
    });
  });

  it("returns fallback for unknown status", () => {
    expect(getStatusBadge("unknown_status")).toEqual({
      label: "Unknown",
      tone: "neutral",
    });
  });

  it("returns fallback for null", () => {
    expect(getStatusBadge(null)).toEqual({
      label: "Unknown",
      tone: "neutral",
    });
  });

  it("returns fallback for empty string", () => {
    expect(getStatusBadge("")).toEqual({
      label: "Unknown",
      tone: "neutral",
    });
  });
});
