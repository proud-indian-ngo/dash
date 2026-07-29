import { describe, expect, it } from "vitest";
import { getMutationResultErrorMessage } from "./mutation-result";

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
