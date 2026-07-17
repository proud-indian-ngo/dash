import { describe, expect, it, vi } from "vitest";
import { buildScheduledWhatsAppMedia } from "./scheduled-whatsapp-media";

describe("buildScheduledWhatsAppMedia", () => {
  it("signs each attachment for fifteen minutes at execution time", () => {
    const presign = vi.fn((key: string) => `https://r2.example.test/${key}`);

    expect(
      buildScheduledWhatsAppMedia(
        [
          {
            fileName: "agenda.pdf",
            mimeType: "application/pdf",
            r2Key: "legacy/messages/agenda.pdf",
          },
        ],
        { presign }
      )
    ).toEqual([
      {
        fileName: "agenda.pdf",
        mimeType: "application/pdf",
        url: "https://r2.example.test/legacy/messages/agenda.pdf",
      },
    ]);
    expect(presign).toHaveBeenCalledWith("legacy/messages/agenda.pdf", {
      expiresIn: 900,
      method: "GET",
    });
  });

  it("rejects temporary object keys", () => {
    const presign = vi.fn();

    expect(() =>
      buildScheduledWhatsAppMedia(
        [
          {
            fileName: "agenda.pdf",
            mimeType: "application/pdf",
            r2Key: "app/messages/tmp/user/agenda.pdf",
          },
        ],
        { presign }
      )
    ).toThrow("Temporary R2 objects cannot be delivered");
    expect(presign).not.toHaveBeenCalled();
  });
});
