import { describe, expect, it } from "vitest";
import { getStatusBadge } from "./status-badge";

describe("getStatusBadge", () => {
  it('maps draft to "Draft" label with "secondary" variant', () => {
    expect(getStatusBadge("draft")).toEqual({
      label: "Draft",
      variant: "secondary",
    });
  });

  it('maps pending to "Pending" label with "warning-outline" variant', () => {
    expect(getStatusBadge("pending")).toEqual({
      label: "Pending",
      variant: "warning-outline",
    });
  });

  it('maps approved to "Approved" label with "success-outline" variant', () => {
    expect(getStatusBadge("approved")).toEqual({
      label: "Approved",
      variant: "success-outline",
    });
  });

  it('maps rejected to "Rejected" label with "destructive-outline" variant', () => {
    expect(getStatusBadge("rejected")).toEqual({
      label: "Rejected",
      variant: "destructive-outline",
    });
  });

  it('maps partially_paid to "Partially Paid" with "warning-outline" variant', () => {
    expect(getStatusBadge("partially_paid")).toEqual({
      label: "Partially Paid",
      variant: "warning-outline",
    });
  });

  it('maps paid to "Paid" with "success-outline" variant', () => {
    expect(getStatusBadge("paid")).toEqual({
      label: "Paid",
      variant: "success-outline",
    });
  });

  it("returns fallback for unknown status", () => {
    expect(getStatusBadge("unknown_status")).toEqual({
      label: "Unknown",
      variant: "secondary",
    });
  });

  it("returns fallback for null", () => {
    expect(getStatusBadge(null)).toEqual({
      label: "Draft",
      variant: "secondary",
    });
  });
});
