import { describe, expect, it } from "bun:test";

import {
  SOCIAL_MEDIA_URL_TTL_SECONDS,
  signSocialMediaUrl,
  verifySocialMediaSignature,
} from "./social-media-url";

const SECRET = "s".repeat(32);
const PHOTO_ID = "019a0000-0000-7000-8000-0000000000b1";
const NOW = Date.UTC(2026, 9, 11, 12);

function signed(variant: "original" | "thumbnail" = "original") {
  const url = new URL(
    signSocialMediaUrl({
      baseUrl: "https://dash.proudindian.ngo",
      nowMs: NOW,
      photoId: PHOTO_ID,
      secret: SECRET,
      variant,
    })
  );
  return {
    exp: url.searchParams.get("exp"),
    sig: url.searchParams.get("sig"),
    url,
  };
}

const verify = (
  overrides: Partial<Parameters<typeof verifySocialMediaSignature>[0]> = {}
) => {
  const { exp, sig } = signed();
  return verifySocialMediaSignature({
    exp,
    nowMs: NOW,
    photoId: PHOTO_ID,
    secret: SECRET,
    sig,
    variant: "original",
    ...overrides,
  });
};

describe("signed social media URLs", () => {
  it("points at the token-free proxy and expires in 36 hours", () => {
    const { exp, url } = signed("thumbnail");
    expect(url.origin + url.pathname).toBe(
      `https://dash.proudindian.ngo/api/social/v1/media/${PHOTO_ID}/thumbnail`
    );
    expect(Number(exp)).toBe(NOW / 1000 + SOCIAL_MEDIA_URL_TTL_SECONDS);
    expect(SOCIAL_MEDIA_URL_TTL_SECONDS).toBeGreaterThanOrEqual(24 * 3600);
  });

  it("verifies an untouched link until it expires", () => {
    expect(verify()).toBe(true);
    expect(
      verify({ nowMs: NOW + (SOCIAL_MEDIA_URL_TTL_SECONDS - 1) * 1000 })
    ).toBe(true);
    expect(verify({ nowMs: NOW + SOCIAL_MEDIA_URL_TTL_SECONDS * 1000 })).toBe(
      false
    );
  });

  it("rejects tampered photo, variant, expiry, signature or secret", () => {
    const { exp, sig } = signed();
    expect(verify({ photoId: "019a0000-0000-7000-8000-0000000000b2" })).toBe(
      false
    );
    expect(verify({ variant: "thumbnail" })).toBe(false);
    expect(verify({ exp: String(Number(exp) + 3600) })).toBe(false);
    expect(
      verify({ sig: `${sig?.slice(0, -1)}${sig?.endsWith("0") ? "1" : "0"}` })
    ).toBe(false);
    expect(verify({ secret: "t".repeat(32) })).toBe(false);
  });

  it("rejects missing or malformed parameters without throwing", () => {
    expect(verify({ exp: null })).toBe(false);
    expect(verify({ sig: null })).toBe(false);
    expect(verify({ sig: "abc" })).toBe(false);
    expect(verify({ sig: "Z".repeat(64) })).toBe(false);
    expect(verify({ exp: "-1" })).toBe(false);
    expect(verify({ exp: "1e12" })).toBe(false);
  });
});
