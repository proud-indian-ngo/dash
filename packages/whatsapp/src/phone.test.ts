import { describe, expect, it } from "vitest";
import { formatPhoneForWhatsApp } from "./phone";

describe("formatPhoneForWhatsApp", () => {
  it("strips all non-digit characters", () => {
    expect(formatPhoneForWhatsApp("+91 98765-43210")).toBe("919876543210");
    expect(formatPhoneForWhatsApp("(091) 987.654.3210")).toBe("0919876543210");
  });

  it("returns empty string for no digits", () => {
    expect(formatPhoneForWhatsApp("+++")).toBe("");
  });
});
