import { describe, expect, it } from "vitest";
import { buildAvatarUrl } from "./avatar";

describe("buildAvatarUrl", () => {
  it("builds URL with email", () => {
    const url = buildAvatarUrl("User@Example.COM");
    expect(url).toBe("/api/avatar?email=user%40example.com");
  });

  it("includes gender param when valid", () => {
    const url = buildAvatarUrl("a@b.com", "male");
    expect(url).toBe("/api/avatar?email=a%40b.com&gender=male");
  });

  it("includes female gender", () => {
    const url = buildAvatarUrl("a@b.com", "Female");
    expect(url).toBe("/api/avatar?email=a%40b.com&gender=female");
  });

  it("ignores invalid gender", () => {
    const url = buildAvatarUrl("a@b.com", "other");
    expect(url).toBe("/api/avatar?email=a%40b.com");
  });

  it("returns undefined for null email", () => {
    expect(buildAvatarUrl(null)).toBeUndefined();
  });

  it("returns undefined for whitespace email", () => {
    expect(buildAvatarUrl("   ")).toBeUndefined();
  });
});
