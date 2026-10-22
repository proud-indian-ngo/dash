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
  sendCloudTemplate,
} from "./cloud";
import { whatsappTemplate } from "./template-message";

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

describe("sendCloudTemplate", () => {
  it("uploads a PDF and references its media ID in the document header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "media-1" }))
      .mockResolvedValueOnce(Response.json({ messages: [{ id: "wamid.1" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const message = whatsappTemplate(
      "donation_receipt",
      {
        amount: "₹5,000",
        number: "PI-2026-0012",
        received_on: "21 October 2026",
      },
      {
        bytes: new Uint8Array([37, 80, 68, 70]),
        filename: "receipt-PI-2026-0012.pdf",
      }
    );

    await expect(sendCloudTemplate("+91 99999 99999", message)).resolves.toBe(
      "wamid.1"
    );

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(uploadUrl).toBe("https://graph.facebook.com/v25.0/phone/media");
    expect(uploadInit.headers).toEqual({ Authorization: "Bearer token" });
    const form = uploadInit.body as FormData;
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect(form.get("type")).toBe("application/pdf");
    expect((form.get("file") as File).name).toBe("receipt-PI-2026-0012.pdf");

    const [, sendInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(sendInit.body as string)).toMatchObject({
      messaging_product: "whatsapp",
      template: {
        components: [
          {
            parameters: [
              {
                document: {
                  filename: "receipt-PI-2026-0012.pdf",
                  id: "media-1",
                },
                type: "document",
              },
            ],
            type: "header",
          },
          { type: "body" },
        ],
        name: "donation_receipt",
      },
      to: "919999999999",
      type: "template",
    });
  });
});
