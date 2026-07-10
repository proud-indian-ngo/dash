import { describe, expect, it } from "vitest";
import {
  buildAvatarMediaUrl,
  buildEventUpdateMediaUrl,
  getPlateImageUrls,
  parseAvatarMediaKey,
  parseEventUpdateMediaKey,
  transformPlateImageUrls,
} from "./media-url";

const LEGACY_CDN_URL = "https://cdn.example.test/assets";

describe("private media URLs", () => {
  it("builds and parses canonical avatar URLs", () => {
    const url = buildAvatarMediaUrl("user/one", "app/avatars/user/one/a.jpg");

    expect(url).toBe(
      "/api/media/avatar/user%2Fone?key=app%2Favatars%2Fuser%2Fone%2Fa.jpg"
    );
    expect(
      parseAvatarMediaKey(url, {
        legacyCdnUrl: LEGACY_CDN_URL,
        userId: "user/one",
      })
    ).toBe("app/avatars/user/one/a.jpg");
  });

  it("parses only exact legacy CDN origins and paths", () => {
    expect(
      parseAvatarMediaKey(
        "https://cdn.example.test/assets/app/avatars/user-1/a.jpg",
        { legacyCdnUrl: LEGACY_CDN_URL, userId: "user-1" }
      )
    ).toBe("app/avatars/user-1/a.jpg");
    expect(
      parseAvatarMediaKey(
        "https://cdn.example.test.evil/assets/app/avatars/user-1/a.jpg",
        { legacyCdnUrl: LEGACY_CDN_URL, userId: "user-1" }
      )
    ).toBeNull();
    expect(
      parseAvatarMediaKey(
        "https://cdn.example.test/assets-other/app/avatars/user-1/a.jpg",
        { legacyCdnUrl: LEGACY_CDN_URL, userId: "user-1" }
      )
    ).toBeNull();
    expect(
      parseAvatarMediaKey(
        "https://cdn.example.test/assets/app/avatars/user-2/a.jpg",
        { legacyCdnUrl: LEGACY_CDN_URL, userId: "user-1" }
      )
    ).toBeNull();
    expect(
      parseAvatarMediaKey(
        "https://cdn.example.test/assets/app/attachments/user-1/a.jpg",
        { legacyCdnUrl: LEGACY_CDN_URL, userId: "user-1" }
      )
    ).toBeNull();
  });

  it("parses only raw keys in the expected media scope", () => {
    expect(
      parseAvatarMediaKey("app/avatars/user-1/a.jpg", {
        legacyCdnUrl: LEGACY_CDN_URL,
        userId: "user-1",
      })
    ).toBe("app/avatars/user-1/a.jpg");
    expect(
      parseEventUpdateMediaKey("app/updates/event-1/a.jpg", {
        eventId: "event-1",
        legacyCdnUrl: LEGACY_CDN_URL,
      })
    ).toBe("app/updates/event-1/a.jpg");
    expect(
      parseEventUpdateMediaKey("app/updates/event-2/a.jpg", {
        eventId: "event-1",
        legacyCdnUrl: LEGACY_CDN_URL,
      })
    ).toBeNull();
  });

  it.each([
    "literal%.jpg",
    "literal%20.jpg",
    "literal?.jpg",
    "literal#.jpg",
  ])("preserves opaque object-key suffix %s", (suffix) => {
    const avatarKey = `app/avatars/user-1/${suffix}`;
    const updateKey = `app/updates/event-1/${suffix}`;

    expect(
      parseAvatarMediaKey(avatarKey, {
        legacyCdnUrl: LEGACY_CDN_URL,
        userId: "user-1",
      })
    ).toBe(avatarKey);
    expect(
      parseEventUpdateMediaKey(`${LEGACY_CDN_URL}/${updateKey}`, {
        eventId: "event-1",
        legacyCdnUrl: LEGACY_CDN_URL,
      })
    ).toBe(updateKey);
  });

  it("does not treat encoded separators as generated key separators", () => {
    expect(
      parseEventUpdateMediaKey(
        `${LEGACY_CDN_URL}/app%2Fupdates%2Fevent-1%2Fimage.jpg`,
        {
          eventId: "event-1",
          legacyCdnUrl: LEGACY_CDN_URL,
        }
      )
    ).toBeNull();
  });

  it("binds canonical media URLs to their event", () => {
    const url = buildEventUpdateMediaUrl(
      "event-1",
      "app/updates/event-1/photo.jpg"
    );

    expect(
      parseEventUpdateMediaKey(url, {
        eventId: "event-1",
        legacyCdnUrl: LEGACY_CDN_URL,
      })
    ).toBe("app/updates/event-1/photo.jpg");
    expect(
      parseEventUpdateMediaKey(url, {
        eventId: "event-2",
        legacyCdnUrl: LEGACY_CDN_URL,
      })
    ).toBeNull();
  });
});

describe("transformPlateImageUrls", () => {
  it("rewrites nested image nodes and preserves external and canonical URLs", () => {
    const canonical = buildEventUpdateMediaUrl(
      "event-1",
      "app/updates/event-1/already.jpg"
    );
    const content = JSON.stringify([
      {
        children: [
          {
            children: [{ text: "" }],
            type: "img",
            url: "https://cdn.example.test/assets/app/updates/event-1/old.jpg",
          },
          {
            children: [{ text: "" }],
            type: "img",
            url: canonical,
          },
          {
            children: [{ text: "" }],
            type: "img",
            url: "https://images.example.org/external.jpg",
          },
        ],
        type: "p",
      },
    ]);

    const result = transformPlateImageUrls(content, (url) => {
      const key = parseEventUpdateMediaKey(url, {
        eventId: "event-1",
        legacyCdnUrl: LEGACY_CDN_URL,
      });
      return key ? buildEventUpdateMediaUrl("event-1", key) : url;
    });

    expect(result).toMatchObject({
      changedCount: 1,
      imageCount: 3,
      malformed: false,
    });
    expect(result.content).toContain(
      buildEventUpdateMediaUrl("event-1", "app/updates/event-1/old.jpg")
    );
    expect(result.content).toContain(canonical);
    expect(result.content).toContain("https://images.example.org/external.jpg");
  });

  it("reports malformed Plate JSON without changing it", () => {
    expect(transformPlateImageUrls("{broken", (url) => url)).toEqual({
      changedCount: 0,
      content: "{broken",
      imageCount: 0,
      malformed: true,
    });
  });

  it("rejects content deeper than the traversal limit without returning references", () => {
    let nested: unknown = {
      children: [{ text: "" }],
      type: "img",
      url: "app/updates/event-1/deep.jpg",
    };
    for (let depth = 0; depth < 150; depth += 1) {
      nested = [nested];
    }
    const content = JSON.stringify([nested]);

    expect(getPlateImageUrls(content)).toEqual({
      malformed: true,
      urls: [],
    });
    expect(transformPlateImageUrls(content, () => "changed")).toEqual({
      changedCount: 0,
      content,
      imageCount: 0,
      malformed: true,
    });
  });
});
