import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/social-api", () => ({
  findSocialOccurrenceRowId: mock(),
  getSocialEventPhotos: mock(),
  getSocialPhotoAssetId: mock(),
  updateSocialPhotoMetadata: mock(),
}));

import type { SocialPhotoRow } from "@pi-dash/db/queries/social-api";

import { verifySocialMediaSignature } from "@/lib/social-media-url";

import { handleSocialMediaRequest, type SocialMediaDeps } from "./media";
import {
  handleSocialPhotosRequest,
  SOCIAL_PHOTO_BACKFILL_CONCURRENCY,
  type SocialPhotosDeps,
} from "./photos";
import { stubAuthorize } from "./test-helpers";

const SECRET = "x".repeat(32);
const NOW = Date.UTC(2026, 9, 11, 12);
const EVENT_ID = "019a0000-0000-7000-8000-000000000001";

function photo(id: string, overrides: Partial<SocialPhotoRow> = {}) {
  return {
    caption: null,
    createdAt: new Date("2026-10-04T00:00:00Z"),
    doNotUse: false,
    height: 3024,
    id: `019a0000-0000-7000-8000-0000000000${id}`,
    immichAssetId: `asset-${id}`,
    takenAt: new Date("2026-10-03T05:00:00Z"),
    width: 4032,
    ...overrides,
  } satisfies SocialPhotoRow;
}

function createPhotosDeps(
  rows: SocialPhotoRow[] | null,
  overrides: Partial<SocialPhotosDeps> = {}
) {
  const fetchAssetMetadata = mock(async () => ({
    height: 1080,
    takenAt: new Date("2026-10-03T04:00:00Z"),
    width: 1920,
  }));
  const updateSocialPhotoMetadata = mock(async () => undefined);
  const deps: SocialPhotosDeps = {
    authorize: stubAuthorize(),
    baseUrl: "https://dash.proudindian.ngo",
    fetchAssetMetadata,
    findSocialOccurrenceRowId: mock(async () => null),
    getSocialEventPhotos: mock(async () => rows),
    now: () => NOW,
    signingSecret: SECRET,
    updateSocialPhotoMetadata,
    ...overrides,
  };
  return { deps, fetchAssetMetadata, updateSocialPhotoMetadata };
}

const photosRequest = () =>
  new Request(
    `https://dash.proudindian.ngo/api/social/v1/events/${EVENT_ID}/photos`
  );

describe("handleSocialPhotosRequest", () => {
  it("returns signed links, keeps do-not-use photos flagged, backfills missing metadata and sorts by takenAt", async () => {
    const { deps, fetchAssetMetadata, updateSocialPhotoMetadata } =
      createPhotosDeps([
        photo("01", { caption: "Drawing", doNotUse: true }),
        photo("02", { height: null, takenAt: null, width: null }),
      ]);

    const response = await handleSocialPhotosRequest(
      photosRequest(),
      EVENT_ID,
      deps
    );
    const { photos } = (await response.json()) as {
      photos: Record<string, unknown>[];
    };

    expect(response.status).toBe(200);
    expect(fetchAssetMetadata).toHaveBeenCalledTimes(1);
    expect(fetchAssetMetadata).toHaveBeenCalledWith("asset-02");
    expect(updateSocialPhotoMetadata).toHaveBeenCalledWith(
      photo("02").id,
      expect.objectContaining({ height: 1080, width: 1920 })
    );
    expect(
      photos.map((p) => [p.id, p.width, p.height, p.takenAt, p.doNotUse])
    ).toEqual([
      [photo("02").id, 1920, 1080, "2026-10-03T04:00:00.000Z", false],
      [photo("01").id, 4032, 3024, "2026-10-03T05:00:00.000Z", true],
    ]);
    expect(photos[1]?.caption).toBe("Drawing");
    const url = new URL(String(photos[0]?.url));
    expect(url.pathname).toBe(
      `/api/social/v1/media/${photo("02").id}/original`
    );
    expect(
      verifySocialMediaSignature({
        exp: url.searchParams.get("exp"),
        nowMs: NOW,
        photoId: photo("02").id,
        secret: SECRET,
        sig: url.searchParams.get("sig"),
        variant: "original",
      })
    ).toBe(true);
    expect(String(photos[0]?.thumbnailUrl)).toContain("/thumbnail?");
  });

  it("keeps a photo with unknown metadata when the Immich lookup fails", async () => {
    const { deps } = createPhotosDeps(
      [photo("03", { height: null, takenAt: null, width: null })],
      { fetchAssetMetadata: mock(() => Promise.reject(new Error("down"))) }
    );
    const response = await handleSocialPhotosRequest(
      photosRequest(),
      EVENT_ID,
      deps
    );
    const { photos } = (await response.json()) as {
      photos: Record<string, unknown>[];
    };
    expect(photos[0]).toMatchObject({
      height: 0,
      takenAt: "2026-10-04T00:00:00.000Z",
      width: 0,
    });
  });

  it("persists 0 for sizes Immich does not know, and does not look them up again", async () => {
    const { deps, updateSocialPhotoMetadata } = createPhotosDeps(
      [photo("04", { height: null, takenAt: null, width: null })],
      {
        fetchAssetMetadata: mock(async () => ({
          height: null,
          takenAt: null,
          width: null,
        })),
      }
    );
    const response = await handleSocialPhotosRequest(
      photosRequest(),
      EVENT_ID,
      deps
    );
    expect(response.status).toBe(200);
    expect(updateSocialPhotoMetadata).toHaveBeenCalledWith(photo("04").id, {
      height: 0,
      takenAt: null,
      width: 0,
    });

    const checked = createPhotosDeps([
      photo("04", { height: 0, takenAt: null, width: 0 }),
    ]);
    await handleSocialPhotosRequest(photosRequest(), EVENT_ID, checked.deps);
    expect(checked.fetchAssetMetadata).not.toHaveBeenCalled();
  });

  it("runs at most four Immich lookups at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchAssetMetadata = mock(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { height: 10, takenAt: null, width: 10 };
    });
    const rows = Array.from({ length: 10 }, (_, i) =>
      photo(String(i + 10), { height: null, width: null })
    );
    const { deps } = createPhotosDeps(rows, { fetchAssetMetadata });
    const response = await handleSocialPhotosRequest(
      photosRequest(),
      EVENT_ID,
      deps
    );
    expect(response.status).toBe(200);
    expect(fetchAssetMetadata).toHaveBeenCalledTimes(10);
    expect(SOCIAL_PHOTO_BACKFILL_CONCURRENCY).toBe(4);
    expect(peak).toBe(4);
  });

  it("ranks usable photos first and caps after ranking", async () => {
    // 12 early do-not-use photos must not displace later usable ones.
    const flagged = Array.from({ length: 12 }, (_, i) =>
      photo(String(i + 10), {
        doNotUse: true,
        takenAt: new Date(Date.UTC(2026, 9, 3, 4, i)),
      })
    );
    const usable = [
      photo("40", { takenAt: new Date(Date.UTC(2026, 9, 3, 6)) }),
      photo("41", { takenAt: new Date(Date.UTC(2026, 9, 3, 5)) }),
    ];
    const { deps } = createPhotosDeps([...flagged, ...usable]);
    const response = await handleSocialPhotosRequest(
      photosRequest(),
      EVENT_ID,
      deps
    );
    const { photos } = (await response.json()) as {
      photos: { doNotUse: boolean; id: string }[];
    };
    expect(photos).toHaveLength(12);
    expect(photos.slice(0, 2).map((p) => p.id)).toEqual([
      photo("41").id,
      photo("40").id,
    ]);
    expect(photos.slice(2).every((p) => p.doNotUse)).toBe(true);
  });

  it("resolves a virtual occurrence id to its exception row", async () => {
    const exceptionId = photo("99").id;
    const findSocialOccurrenceRowId = mock(async () => exceptionId);
    const { deps } = createPhotosDeps([photo("01")], {
      findSocialOccurrenceRowId,
    });
    const response = await handleSocialPhotosRequest(
      photosRequest(),
      `${EVENT_ID}:2026-10-10`,
      deps
    );
    expect(response.status).toBe(200);
    expect(findSocialOccurrenceRowId).toHaveBeenCalledWith(
      EVENT_ID,
      "2026-10-10"
    );
    expect(deps.getSocialEventPhotos).toHaveBeenCalledWith(exceptionId);
    const { photos } = (await response.json()) as { photos: unknown[] };
    expect(photos).toHaveLength(1);
  });

  it("returns an empty list for a virtual occurrence with no exception row", async () => {
    const { deps } = createPhotosDeps([photo("01")]);
    const response = await handleSocialPhotosRequest(
      photosRequest(),
      `${EVENT_ID}:2026-10-10`,
      deps
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ photos: [] });
    expect(deps.getSocialEventPhotos).not.toHaveBeenCalled();
  });

  it("rejects a malformed composite id", async () => {
    for (const id of [`${EVENT_ID}:soon`, "series:2026-10-10"]) {
      const response = await handleSocialPhotosRequest(
        photosRequest(),
        id,
        createPhotosDeps([]).deps
      );
      expect(response.status).toBe(400);
    }
  });

  it("returns at most 12 photos", async () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      photo(String(i + 10), {
        takenAt: new Date(Date.UTC(2026, 9, 3, 5, i)),
      })
    );
    const { deps } = createPhotosDeps(rows);
    const response = await handleSocialPhotosRequest(
      photosRequest(),
      EVENT_ID,
      deps
    );
    const { photos } = (await response.json()) as { photos: unknown[] };
    expect(photos).toHaveLength(12);
  });

  it("returns 404 for an unlisted event, 400 for a bad id and 503 when unconfigured", async () => {
    expect(
      (
        await handleSocialPhotosRequest(
          photosRequest(),
          EVENT_ID,
          createPhotosDeps(null).deps
        )
      ).status
    ).toBe(404);
    expect(
      (
        await handleSocialPhotosRequest(
          photosRequest(),
          "not-a-uuid",
          createPhotosDeps([]).deps
        )
      ).status
    ).toBe(400);
    expect(
      (
        await handleSocialPhotosRequest(
          photosRequest(),
          EVENT_ID,
          createPhotosDeps([], { signingSecret: undefined }).deps
        )
      ).status
    ).toBe(503);
  });

  it("lists photos without a metadata backfill when Immich is unconfigured", async () => {
    const { deps, updateSocialPhotoMetadata } = createPhotosDeps(
      [photo("01", { height: null, width: null })],
      { fetchAssetMetadata: null }
    );
    const response = await handleSocialPhotosRequest(
      photosRequest(),
      EVENT_ID,
      deps
    );
    expect(response.status).toBe(200);
    const { photos } = (await response.json()) as {
      photos: { width: number }[];
    };
    expect(photos).toHaveLength(1);
    expect(photos[0]?.width).toBe(0);
    expect(updateSocialPhotoMetadata).not.toHaveBeenCalled();
  });
});

function createMediaDeps(overrides: Partial<SocialMediaDeps> = {}) {
  const fetchAsset = mock(
    async () =>
      new Response("jpeg-bytes", {
        headers: { "content-length": "10", "content-type": "image/jpeg" },
      })
  );
  const deps: SocialMediaDeps = {
    fetchAsset,
    getSocialPhotoAssetId: mock(async () => "asset-01"),
    now: () => NOW,
    signingSecret: SECRET,
    ...overrides,
  };
  return { deps, fetchAsset };
}

async function signedMediaUrl(variant: "original" | "thumbnail") {
  const { deps } = createPhotosDeps([photo("01")]);
  const response = await handleSocialPhotosRequest(
    photosRequest(),
    EVENT_ID,
    deps
  );
  const { photos } = (await response.json()) as {
    photos: { thumbnailUrl: string; url: string }[];
  };
  return variant === "original" ? photos[0]?.url : photos[0]?.thumbnailUrl;
}

describe("handleSocialMediaRequest", () => {
  it("streams a validly signed photo with private caching", async () => {
    const url = String(await signedMediaUrl("thumbnail"));
    const { deps, fetchAsset } = createMediaDeps();

    const response = await handleSocialMediaRequest(
      new Request(url),
      { photoId: photo("01").id, variant: "thumbnail" },
      deps
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(await response.text()).toBe("jpeg-bytes");
    expect(fetchAsset).toHaveBeenCalledWith("asset-01", "thumbnail");
  });

  it("refuses a link for another variant, an expired link and a missing signature", async () => {
    const url = String(await signedMediaUrl("thumbnail"));
    const { deps, fetchAsset } = createMediaDeps();
    const params = { photoId: photo("01").id, variant: "original" };
    expect(
      (await handleSocialMediaRequest(new Request(url), params, deps)).status
    ).toBe(403);

    const expired = createMediaDeps({ now: () => NOW + 37 * 3600 * 1000 });
    expect(
      (
        await handleSocialMediaRequest(
          new Request(url),
          { ...params, variant: "thumbnail" },
          expired.deps
        )
      ).status
    ).toBe(403);

    const bare = new URL(url);
    bare.search = "";
    expect(
      (
        await handleSocialMediaRequest(
          new Request(bare),
          { ...params, variant: "thumbnail" },
          deps
        )
      ).status
    ).toBe(403);
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown variants or photos and 503 when unconfigured", async () => {
    const url = String(await signedMediaUrl("original"));
    const params = { photoId: photo("01").id, variant: "original" };
    expect(
      (
        await handleSocialMediaRequest(
          new Request(url),
          { ...params, variant: "preview" },
          createMediaDeps().deps
        )
      ).status
    ).toBe(404);
    expect(
      (
        await handleSocialMediaRequest(
          new Request(url),
          params,
          createMediaDeps({ getSocialPhotoAssetId: mock(async () => null) })
            .deps
        )
      ).status
    ).toBe(404);
    expect(
      (
        await handleSocialMediaRequest(
          new Request(url),
          params,
          createMediaDeps({ signingSecret: undefined }).deps
        )
      ).status
    ).toBe(503);
  });

  it("returns 502 when Immich fails", async () => {
    const url = String(await signedMediaUrl("original"));
    const response = await handleSocialMediaRequest(
      new Request(url),
      { photoId: photo("01").id, variant: "original" },
      createMediaDeps({
        fetchAsset: mock(() => Promise.reject(new Error("immich down"))),
      }).deps
    );
    expect(response.status).toBe(502);
  });
});
