import { describe, expect, it } from "vitest";
import { getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
  it("extracts message from Error", () => {
    expect(getErrorMessage(new Error("fail"))).toBe("fail");
  });

  it("returns fallback for non-Error", () => {
    expect(getErrorMessage("string error")).toBe("Something went wrong");
  });

  it("returns custom fallback", () => {
    expect(getErrorMessage(null, "Custom fallback")).toBe("Custom fallback");
  });
});
