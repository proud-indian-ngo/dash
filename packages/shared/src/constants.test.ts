import { describe, expect, it } from "vitest";
import { formatEnumLabel } from "./constants";

describe("formatEnumLabel", () => {
  it("converts snake_case to Title Case", () => {
    expect(formatEnumLabel("invoice_submitted")).toBe("Invoice Submitted");
  });

  it("capitalizes a single word", () => {
    expect(formatEnumLabel("bangalore")).toBe("Bangalore");
  });

  it("handles multiple underscores", () => {
    expect(formatEnumLabel("invoice_approved")).toBe("Invoice Approved");
  });

  it("handles already-capitalized input", () => {
    expect(formatEnumLabel("Male")).toBe("Male");
  });

  it("handles empty string", () => {
    expect(formatEnumLabel("")).toBe("");
  });
});
