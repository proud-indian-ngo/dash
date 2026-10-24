import { buildAvatarMediaUrl } from "@pi-dash/shared/media-url";
import { describe, expect, it } from "vitest";

import { assertSuppliedAvatarImage } from "./avatar-image";

const userId = "user-1";
const key = "app/avatars/user-1/validated/019604cc-6759-7000-8000-000000000001";
const url = buildAvatarMediaUrl(userId, key);

describe("supplied avatar images", () => {
  it("allows omission and removal", () => {
    for (const image of [undefined, null, ""]) {
      expect(() =>
        assertSuppliedAvatarImage(image, { keyPrefix: "app", userId })
      ).not.toThrow();
    }
  });
  it("accepts only the canonical owned validated image URL", () => {
    expect(() =>
      assertSuppliedAvatarImage(url, { keyPrefix: "app", userId })
    ).not.toThrow();
  });
  it.each([
    buildAvatarMediaUrl(userId, "app/avatars/tmp/user-1/upload.png"),
    buildAvatarMediaUrl(userId, "app/avatars/user-1/legacy.png"),
    buildAvatarMediaUrl("user-2", key),
    buildAvatarMediaUrl(
      userId,
      "app/avatars/user-2/validated/019604cc-6759-7000-8000-000000000001"
    ),
    `https://cdn.test/${key}`,
    key,
    `${url}&extra=value`,
    "javascript:alert(1)",
  ])("rejects an unvalidated or foreign supplied image: %s", (image) => {
    expect(() =>
      assertSuppliedAvatarImage(image, { keyPrefix: "app", userId })
    ).toThrow();
  });
  it("cannot supply an image during account creation", () => {
    expect(() =>
      assertSuppliedAvatarImage(url, { keyPrefix: "app" })
    ).toThrow();
  });
});
