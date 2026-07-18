import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  logSet: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("evlog", () => ({
  createRequestLogger: () => ({
    emit: vi.fn(),
    error: mocks.error,
    set: mocks.logSet,
    warn: mocks.warn,
  }),
}));
vi.mock("./client", () => ({
  getWhatsAppApiUrl: () => "https://whatsapp.example.test",
  getWhatsAppHeaders: () => ({}),
}));

import { sendWhatsAppMedia, sendWhatsAppMessage } from "./messaging";

const signedUrl =
  "https://account.r2.cloudflarestorage.com/bucket/agenda.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=secret";

const loggedText = (): string =>
  JSON.stringify([...mocks.logSet.mock.calls, ...mocks.error.mock.calls]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendWhatsAppMessage", () => {
  it("forwards a deterministic delivery key to the gateway", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetch);

    await sendWhatsAppMessage("919999999999", "Hello", {
      idempotencyKey: "kalakriti-registration-1-whatsapp",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://whatsapp.example.test/send/message",
      expect.objectContaining({
        headers: {
          "Idempotency-Key": "kalakriti-registration-1-whatsapp",
        },
      })
    );
  });
});

describe("sendWhatsAppMedia", () => {
  it("uses the persisted filename without logging a signed document URL", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("document"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await sendWhatsAppMedia("919999999999", {
      fileName: "agenda.pdf",
      mimeType: "application/pdf",
      url: signedUrl,
    });

    const request = fetch.mock.calls[1]?.[1] as RequestInit;
    const file = (request.body as FormData).get("file") as File;
    expect(file.name).toBe("agenda.pdf");
    expect(loggedText()).not.toContain(signedUrl);
  });

  it.each([
    ["image/jpeg", "photo.jpg"],
    ["video/mp4", "video.mp4"],
  ])("does not log signed %s URLs", async (mimeType, fileName) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null)));

    await sendWhatsAppMedia("919999999999", {
      fileName,
      mimeType,
      url: signedUrl,
    });

    expect(loggedText()).not.toContain(signedUrl);
  });

  it.each([
    ["image/jpeg", "photo.jpg"],
    ["video/mp4", "video.mp4"],
  ])(
    "does not expose signed %s URLs from gateway errors",
    async (mimeType, fileName) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(signedUrl, { status: 500 }))
      );

      await expect(
        sendWhatsAppMedia("919999999999", {
          fileName,
          mimeType,
          url: signedUrl,
        })
      ).rejects.not.toThrow(signedUrl);
      expect(loggedText()).not.toContain(signedUrl);
    }
  );

  it("does not include a signed URL in document download errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 403 }))
    );

    await expect(
      sendWhatsAppMedia("919999999999", {
        fileName: "agenda.pdf",
        mimeType: "application/pdf",
        url: signedUrl,
      })
    ).rejects.not.toThrow(signedUrl);
    expect(loggedText()).not.toContain(signedUrl);
  });

  it("does not expose signed document URLs from gateway errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("document"))
        .mockResolvedValueOnce(new Response(signedUrl, { status: 500 }))
    );

    await expect(
      sendWhatsAppMedia("919999999999", {
        fileName: "agenda.pdf",
        mimeType: "application/pdf",
        url: signedUrl,
      })
    ).rejects.not.toThrow(signedUrl);
    expect(loggedText()).not.toContain(signedUrl);
  });
});
