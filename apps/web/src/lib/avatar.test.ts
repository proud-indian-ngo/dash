import { describe, expect, it } from "vitest";
import { buildAvatarUrl, resolveAvatarSrc } from "./avatar";

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

describe("resolveAvatarSrc", () => {
  it("returns user.image when set", () => {
    const src = resolveAvatarSrc({
      email: "a@b.com",
      image: "https://cdn.example.com/avatar.jpg",
    });
    expect(src).toBe("https://cdn.example.com/avatar.jpg");
  });

  it("falls back to buildAvatarUrl when image is null", () => {
    const src = resolveAvatarSrc({
      email: "a@b.com",
      image: null,
    });
    expect(src).toBe("/api/avatar?email=a%40b.com");
  });

  it("falls back to buildAvatarUrl when image is empty string", () => {
    const src = resolveAvatarSrc({
      email: "a@b.com",
      image: "",
    });
    expect(src).toBe("/api/avatar?email=a%40b.com");
  });

  it("falls back to buildAvatarUrl when image is undefined", () => {
    const src = resolveAvatarSrc({
      email: "a@b.com",
    });
    expect(src).toBe("/api/avatar?email=a%40b.com");
  });

  it("returns undefined when both image and email are absent", () => {
    const src = resolveAvatarSrc({});
    expect(src).toBeUndefined();
  });

  it("passes gender through to buildAvatarUrl", () => {
    const src = resolveAvatarSrc({
      email: "a@b.com",
      gender: "female",
      image: null,
    });
    expect(src).toBe("/api/avatar?email=a%40b.com&gender=female");
  });
});
