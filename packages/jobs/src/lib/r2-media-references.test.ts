import { describe, expect, it } from "vitest";
import {
  collectAvatarReferenceKey,
  collectPlateReferenceKeys,
} from "./r2-media-references";

const options = {
  keyPrefix: "app",
  legacyCdnUrl: "https://cdn.example.test",
};

describe("collectAvatarReferenceKey", () => {
  it("recognizes raw, legacy, and canonical avatar references", () => {
    const key = "app/avatars/user-1/avatar.jpg";
    expect(collectAvatarReferenceKey("user-1", key, options)).toBe(key);
    expect(
      collectAvatarReferenceKey(
        "user-1",
        `https://cdn.example.test/${key}`,
        options
      )
    ).toBe(key);
    expect(
      collectAvatarReferenceKey(
        "user-1",
        `/api/media/avatar/user-1?key=${encodeURIComponent(key)}`,
        options
      )
    ).toBe(key);
  });

  it("ignores unrelated external avatars", () => {
    expect(
      collectAvatarReferenceKey(
        "user-1",
        "https://images.example.org/avatar.jpg",
        options
      )
    ).toBeNull();
  });
});

describe("collectPlateReferenceKeys", () => {
  it("collects legacy and canonical image keys from valid Plate content", () => {
    const oldKey = "app/updates/event-1/old.jpg";
    const newKey = "app/updates/event-1/new.jpg";
    const content = JSON.stringify([
      {
        children: [{ text: "" }],
        type: "img",
        url: `https://cdn.example.test/${oldKey}`,
      },
      {
        children: [{ text: "" }],
        type: "img",
        url: `/api/media/event-update?eventId=event-1&key=${encodeURIComponent(newKey)}`,
      },
      {
        children: [{ text: "" }],
        type: "img",
        url: "https://images.example.org/external.jpg",
      },
    ]);

    expect(collectPlateReferenceKeys(content, "event-1", options)).toEqual(
      new Set([oldKey, newKey])
    );
  });

  it("conservatively extracts raw and encoded keys from malformed content", () => {
    const rawKey = "app/updates/event-1/raw.jpg";
    const encodedKey = "app/updates/event-1/encoded.jpg";
    const content = `{"broken":"${rawKey}","url":"/api/media/event-update?eventId=event-1&key=${encodeURIComponent(encodedKey)}"`;

    expect(collectPlateReferenceKeys(content, "event-1", options)).toEqual(
      new Set([rawKey, encodedKey])
    );
  });
});
