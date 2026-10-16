import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/env/server", () => ({
  env: {
    WHATSAPP_CLOUD_ACCESS_TOKEN: "token",
    WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID: "waba",
    WHATSAPP_CLOUD_GRAPH_VERSION: "v25.0",
    WHATSAPP_CLOUD_PHONE_NUMBER_ID: "phone",
  },
}));

import {
  CloudApiError,
  getCloudTemplate,
  isTransientCloudError,
  resetCloudTemplateCache,
} from "./cloud";

const templatesPage = () =>
  new Response(
    JSON.stringify({
      data: [
        {
          category: "UTILITY",
          name: "notifications_summary",
          status: "APPROVED",
        },
      ],
    })
  );

beforeEach(() => {
  resetCloudTemplateCache();
  vi.unstubAllGlobals();
});

describe("isTransientCloudError", () => {
  it("retries timeouts, network errors, 5xx and Meta's rate limits", () => {
    expect(isTransientCloudError(new Error("fetch failed"))).toBe(true);
    expect(isTransientCloudError(new CloudApiError("down", 503, 1))).toBe(true);
    expect(
      isTransientCloudError(new CloudApiError("throughput", 400, 130_429))
    ).toBe(true);
    expect(
      isTransientCloudError(new CloudApiError("pair rate", 400, 131_056))
    ).toBe(true);
  });

  it("doesn't retry template, parameter or number errors", () => {
    expect(
      isTransientCloudError(new CloudApiError("no template", 404, 132_001))
    ).toBe(false);
    expect(
      isTransientCloudError(new CloudApiError("param", 400, 131_009))
    ).toBe(false);
    expect(
      isTransientCloudError(new CloudApiError("paused", 400, 132_015))
    ).toBe(false);
  });
});

describe("getCloudTemplate", () => {
  it("caches the template list for an hour", async () => {
    const fetchMock = vi.fn(async () => templatesPage());
    vi.stubGlobal("fetch", fetchMock);
    const now = 1_000_000;

    expect(await getCloudTemplate("notifications_summary", now)).toMatchObject({
      category: "UTILITY",
    });
    await getCloudTemplate("notifications_summary", now + 59 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await getCloudTemplate("notifications_summary", now + 61 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("remembers a failed lookup for five minutes", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 190, message: "bad" } }), {
          status: 401,
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const now = 1_000_000;

    await expect(getCloudTemplate("x", now)).rejects.toThrow("bad");
    await expect(getCloudTemplate("x", now + 4 * 60_000)).rejects.toThrow(
      "bad"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockImplementation(async () => templatesPage());
    await getCloudTemplate("x", now + 6 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
