import { describe, expect, it } from "bun:test";

import { fetchBuildId } from "./new-version";

const respond =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(Response.json(body, { status }));

describe("fetchBuildId", () => {
  it("returns the server's build", async () => {
    expect(await fetchBuildId(respond({ buildId: "b2" }))).toBe("b2");
  });

  it("returns null when the request fails or the body is unexpected", async () => {
    expect(await fetchBuildId(respond({ buildId: "b2" }, 502))).toBeNull();
    expect(await fetchBuildId(respond({ buildId: 7 }))).toBeNull();
    expect(await fetchBuildId(respond({ other: 1 }))).toBeNull();
    expect(
      await fetchBuildId(() => Promise.reject(new TypeError("offline")))
    ).toBeNull();
    expect(
      await fetchBuildId(() =>
        Promise.resolve(new Response("<html>", { status: 200 }))
      )
    ).toBeNull();
  });
});
