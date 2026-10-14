import { expect, test } from "@playwright/test";

const IMMUTABLE = "public, max-age=31536000, immutable";
const ASSET_PATTERN = /\/assets\/[^"']+\.js/;

// Hashed chunks are cached for a year, so an error response under /assets
// must never inherit that header: a cached redirect or 404 would pin a broken
// chunk in browsers and Cloudflare after a deploy.
test.describe("Static asset caching", () => {
  test("serves real chunks as immutable, including revalidations", async ({
    request,
  }) => {
    const html = await (await request.get("/login")).text();
    const asset = ASSET_PATTERN.exec(html)?.[0];
    expect(asset).toBeDefined();

    const response = await request.get(asset as string);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe(IMMUTABLE);

    const etag = response.headers().etag;
    expect(etag).toBeDefined();
    const revalidated = await request.get(asset as string, {
      headers: { "If-None-Match": etag as string },
    });
    expect(revalidated.status()).toBe(304);
    expect(revalidated.headers()["cache-control"]).toBe(IMMUTABLE);
  });

  for (const method of ["GET", "POST"] as const) {
    test(`${method} for a missing chunk is an uncacheable 404`, async ({
      request,
    }) => {
      const response = await request.fetch("/assets/_app-e2e-missing.js", {
        maxRedirects: 0,
        method,
      });
      expect(response.status()).toBe(404);
      expect(response.headers()["cache-control"]).toBe("no-store");
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
      expect(response.headers().location).toBeUndefined();
    });
  }
});
