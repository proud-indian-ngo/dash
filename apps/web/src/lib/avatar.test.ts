import { describe, expect, it, mock } from "bun:test";

import { buildAvatarMediaUrl } from "@pi-dash/shared/media-url";

mock.module("@pi-dash/env/web", () => ({
  env: { VITE_CDN_URL: "https://cdn.example.test/" },
}));

import { buildAvatarUrl, resolveAvatarSrc } from "./avatar";

describe("buildAvatarUrl", () => {
  it("builds a URL with only the public user ID", () => {
    expect(buildAvatarUrl("user-1")).toBe("/api/avatar?userId=user-1");
  });

  it("returns undefined without a user ID", () => {
    expect(buildAvatarUrl()).toBeUndefined();
  });

  it("returns undefined for a whitespace user ID", () => {
    expect(buildAvatarUrl("   ")).toBeUndefined();
  });
});

describe("resolveAvatarSrc", () => {
  it("returns user.image when set", () => {
    const src = resolveAvatarSrc({
      image: "https://cdn.example.com/avatar.jpg",
    });
    expect(src).toBe("https://cdn.example.com/avatar.jpg");
  });

  it("converts a legacy CDN avatar into an authenticated media URL", () => {
    const key = "app/avatars/user-1/avatar.jpg";
    const src = resolveAvatarSrc({
      id: "user-1",
      image: `https://cdn.example.test/${key}`,
    });

    expect(src).toBe(buildAvatarMediaUrl("user-1", key));
  });

  it("falls back to the authenticated avatar endpoint when image is null", () => {
    const src = resolveAvatarSrc({
      id: "user-1",
      image: null,
    });
    expect(src).toBe("/api/avatar?userId=user-1");
  });

  it("falls back to buildAvatarUrl when image is empty string", () => {
    const src = resolveAvatarSrc({
      id: "user-1",
      image: "",
    });
    expect(src).toBe("/api/avatar?userId=user-1");
  });

  it("falls back to buildAvatarUrl when image is undefined", () => {
    const src = resolveAvatarSrc({
      id: "user-1",
    });
    expect(src).toBe("/api/avatar?userId=user-1");
  });

  it("returns undefined when both image and user ID are absent", () => {
    const src = resolveAvatarSrc({});
    expect(src).toBeUndefined();
  });
});
