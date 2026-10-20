import { expect, test } from "@playwright/test";

const IMMUTABLE = "public, max-age=31536000, immutable";
const ASSET_PATTERN = /\/assets\/[^"']+\.js/;

// Hashed chunks are cached for a year, so an error response under /assets
// must never inherit that header: a cached redirect or 404 would pin a broken
// chunk in browsers and Cloudflare after a deploy.
test.describe("Static asset caching", () => {
  test("negotiates streamed compression for server-rendered HTML", async ({
    request,
  }) => {
    test.skip(
      process.env.E2E_SERVER === "dev",
      "This verifies the production Nitro server"
    );

    const identity = await request.get("/login", {
      headers: { "Accept-Encoding": "identity" },
    });
    expect(identity.status()).toBe(200);
    expect(identity.headers()["content-encoding"]).toBeUndefined();
    expect(identity.headers()["content-type"]).toMatch(/^text\/html\b/);
    expect(identity.headers().vary?.toLowerCase()).toContain("accept-encoding");
    const identityHtml = await identity.text();
    expect(identityHtml).toContain('name="email"');
    expect(identityHtml).toContain('type="password"');

    for (const encoding of ["br", "gzip"] as const) {
      const compressed = await request.get("/login", {
        headers: { "Accept-Encoding": encoding },
      });
      expect(compressed.status()).toBe(200);
      expect(compressed.headers()["content-encoding"]).toBe(encoding);
      expect(compressed.headers()["content-length"]).toBeUndefined();
      expect(compressed.headers()["content-type"]).toMatch(/^text\/html\b/);
      expect(compressed.headers().vary?.toLowerCase()).toContain(
        "accept-encoding"
      );
      const compressedHtml = await compressed.text();
      expect(compressedHtml).toContain('name="email"');
      expect(compressedHtml).toContain('type="password"');
    }
  });

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

  test("negotiates equivalent compressed chunks", async ({ request }) => {
    test.skip(
      process.env.E2E_SERVER === "dev",
      "Vite dev does not use Nitro's precompressed public assets"
    );

    const html = await (await request.get("/login")).text();
    const asset = ASSET_PATTERN.exec(html)?.[0];
    expect(asset).toBeDefined();

    const identity = await request.get(asset as string, {
      headers: { "Accept-Encoding": "identity" },
    });
    expect(identity.status()).toBe(200);
    expect(identity.headers()["content-encoding"]).toBeUndefined();
    expect(identity.headers()["content-type"]).toMatch(
      /^(?:application|text)\/javascript\b/
    );
    expect(identity.headers()["cache-control"]).toBe(IMMUTABLE);
    expect(identity.headers().vary?.toLowerCase()).toContain("accept-encoding");
    const identityLength = Number(identity.headers()["content-length"]);
    expect(Number.isSafeInteger(identityLength)).toBe(true);
    expect(identityLength).toBeGreaterThan(0);
    const identityBody = await identity.body();

    for (const encoding of ["gzip", "br"] as const) {
      const compressed = await request.get(asset as string, {
        headers: { "Accept-Encoding": encoding },
      });
      expect(compressed.status()).toBe(200);
      expect(compressed.headers()["content-encoding"]).toBe(encoding);
      expect(compressed.headers()["content-type"]).toMatch(
        /^(?:application|text)\/javascript\b/
      );
      expect(compressed.headers()["cache-control"]).toBe(IMMUTABLE);
      expect(compressed.headers().vary?.toLowerCase()).toContain(
        "accept-encoding"
      );
      const compressedLength = Number(compressed.headers()["content-length"]);
      expect(Number.isSafeInteger(compressedLength)).toBe(true);
      expect(compressedLength).toBeLessThan(identityLength);
      expect((await compressed.body()).equals(identityBody)).toBe(true);

      const etag = compressed.headers().etag;
      expect(etag).toBeDefined();
      const revalidated = await request.get(asset as string, {
        headers: {
          "Accept-Encoding": encoding,
          "If-None-Match": etag as string,
        },
      });
      expect(revalidated.status()).toBe(304);
      expect(revalidated.headers()["cache-control"]).toBe(IMMUTABLE);
      expect(revalidated.headers().vary?.toLowerCase()).toContain(
        "accept-encoding"
      );
    }
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
