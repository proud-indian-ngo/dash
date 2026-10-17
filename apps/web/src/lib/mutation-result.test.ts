import { describe, expect, it } from "bun:test";

import {
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
