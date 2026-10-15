import { describe, expect, it } from "vitest";

import { revealErrorMessage, unreadableValueMessage } from "./encrypted-values";

describe("revealErrorMessage", () => {
  it("passes the key-mismatch message through and hides anything else", () => {
    expect(
      revealErrorMessage(
        new Error(unreadableValueMessage("account number")),
        "account number",
        "fallback"
      )
    ).toContain("different encryption key");
    expect(revealErrorMessage(new Error("boom"), "ID number", "fallback")).toBe(
      "fallback"
    );
    expect(revealErrorMessage("boom", "ID number", "fallback")).toBe(
      "fallback"
    );
  });
});
