import { expect, test } from "@playwright/test";

// Uptime Kuma polls this public endpoint, so it must report the E2E stack's
// active zero-cache slot as healthy without exposing slot details.
test("replication health reports the active Zero slot as ok", async ({
  request,
}) => {
  const response = await request.get("/api/health/replication");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok" });

  // The route file nests under /api/health, which must keep its own handler.
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: "ok" });
});
