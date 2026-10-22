import { describe, expect, it } from "bun:test";

import {
  certificateRefusal,
  getMutationResultErrorMessage,
  joinErrorMessage,
} from "./mutation-result";

describe("getMutationResultErrorMessage", () => {
  it.each([
    [new Error("Error instance"), "Error instance"],
    ["String error", "String error"],
    [
      { details: undefined, message: "Zero application error", type: "app" },
      "Zero application error",
    ],
    [{ type: "unknown" }, "Fallback error"],
  ])("extracts a safe message from %#", (error, expected) => {
    expect(getMutationResultErrorMessage(error, "Fallback error")).toBe(
      expected
    );
  });
});

describe("joinErrorMessage", () => {
  it("passes the safeguarding refusal through and hides anything else", () => {
    expect(
      joinErrorMessage(
        {
          error: new Error(
            "Read and acknowledge the child-safeguarding policy before you join events with children."
          ),
          type: "error",
        },
        "Couldn't join event"
      )
    ).toContain("child-safeguarding policy");
    expect(
      joinErrorMessage(
        { error: new Error("relation does not exist"), type: "error" },
        "Couldn't join event"
      )
    ).toBe("Couldn't join event");
  });
});

describe("certificateRefusal", () => {
  it("passes a certificate's refusal through and hides anything else", () => {
    const refusal =
      "Utilisation certificate UC/2026-27/002 covers this, so unlinking this contribution would change its figures. Cancel it first, then prepare a new one.";
    expect(
      certificateRefusal({ error: new Error(refusal), type: "error" })
    ).toBe(refusal);
    expect(
      certificateRefusal({
        error: new Error(
          "This grant has utilisation certificates, so it is kept. Close it instead."
        ),
        type: "error",
      })
    ).toContain("Close it instead");
    expect(
      certificateRefusal({
        error: new Error("relation does not exist"),
        type: "error",
      })
    ).toBeUndefined();
  });
});
