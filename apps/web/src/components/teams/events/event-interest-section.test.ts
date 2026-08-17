import { describe, expect, it } from "vitest";
import { shouldRenderInterestRequests } from "./event-interest-visibility";

describe("shouldRenderInterestRequests", () => {
  const interests = [{ id: "interest-1" }];

  it("shows requests for an interest manager without event-edit access", () => {
    expect(shouldRenderInterestRequests(true, interests)).toBe(true);
  });

  it("hides requests when the viewer cannot manage interest", () => {
    expect(shouldRenderInterestRequests(false, interests)).toBe(false);
    expect(shouldRenderInterestRequests(undefined, interests)).toBe(false);
  });

  it("hides requests when interest rows were not loaded", () => {
    expect(shouldRenderInterestRequests(true, undefined)).toBe(false);
  });
});
