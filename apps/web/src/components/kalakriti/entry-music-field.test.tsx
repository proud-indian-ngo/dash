import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/functions/attachments", () => ({
  deleteTemporaryUpload: () => undefined,
  getKalakritiEntryMusicUploadUrl: () => undefined,
}));
mock.module("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));
const { EntryMusicUploadField } = await import("./entry-music-field");
const { uploadKalakritiMusicFile } = await import("./entry-music-upload");
const scope = {
  centerId: "center",
  divisionId: "division",
  editionId: "edition",
  entryId: "entry",
};
const key = "attachments/kalakriti-music/tmp/user/track.mp3";
const sign = mock(async () => ({
  presignedUrl: "https://upload.test/audio",
  key,
}));
const discard = mock(async () => ({ success: true as const }));
const originalFetch = globalThis.fetch;
const put = mock(async () => new Response(null, { status: 200 }));
beforeEach(() => {
  sign.mockClear();
  discard.mockClear();
  put.mockClear();
  globalThis.fetch = Object.assign(put, {
    preconnect: originalFetch.preconnect,
  });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Entry music uploads", () => {
  it("renders a multiple-file picker and per-file removal with the cap disabled", () => {
    const html = renderToStaticMarkup(
      <EntryMusicUploadField
        {...scope}
        onChange={() => undefined}
        value={[
          {
            id: "first",
            byteSize: 10,
            fileName: "first.mp3",
            mimeType: "audio/mpeg",
            objectKey: key,
          },
          {
            id: "second",
            byteSize: 10,
            fileName: "second.aac",
            mimeType: "audio/aac",
            objectKey: key,
          },
        ]}
      />
    );
    expect(html).toContain('multiple=""');
    expect(html).toContain('aria-label="Remove first.mp3"');
    expect(html).toContain('aria-label="Remove second.aac"');
    expect(html).toContain('aria-label="Music files"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("20 MB each");
  });
  it("returns an independently identified claim with exact entry signing scope", async () => {
    const file = new File(["audio"], "track.mp3", { type: "audio/mpeg" });
    const claim = await uploadKalakritiMusicFile(file, scope, sign, discard);
    expect(claim).toEqual({
      id: expect.any(String),
      objectKey: key,
      byteSize: 5,
      fileName: "track.mp3",
      mimeType: "audio/mpeg",
    });
    expect(sign).toHaveBeenCalledWith({
      data: {
        ...scope,
        fileName: "track.mp3",
        fileSize: 5,
        mimeType: "audio/mpeg",
      },
    });
    expect(discard).not.toHaveBeenCalled();
  });
  it("accepts M4A and AAC when the browser omits MIME", async () => {
    for (const [name, mime] of [
      ["track.m4a", "audio/x-m4a"],
      ["track.aac", "audio/aac"],
    ] as const) {
      const claim = await uploadKalakritiMusicFile(
        new File(["audio"], name),
        scope,
        sign,
        discard
      );
      expect(claim.mimeType).toBe(mime);
    }
  });
  it("rejects unsupported and oversized files before signing", async () => {
    await expect(
      uploadKalakritiMusicFile(
        new File(["audio"], "track.wav", { type: "audio/wav" }),
        scope,
        sign,
        discard
      )
    ).rejects.toThrow("MP3, M4A, or AAC");
    const oversized = new File(["audio"], "track.mp3");
    Object.defineProperty(oversized, "size", { value: 20 * 1024 * 1024 + 1 });
    await expect(
      uploadKalakritiMusicFile(oversized, scope, sign, discard)
    ).rejects.toThrow("20 MB");
    expect(sign).not.toHaveBeenCalled();
  });
  it("cleans a failed PUT and permits retry without touching a successful upload", async () => {
    put.mockImplementationOnce(async () => new Response(null, { status: 500 }));
    const file = new File(["audio"], "track.mp3");
    await expect(
      uploadKalakritiMusicFile(file, scope, sign, discard)
    ).rejects.toThrow("Upload failed");
    expect(discard).toHaveBeenCalledWith({ data: { key } });
    const claim = await uploadKalakritiMusicFile(file, scope, sign, discard);
    expect(claim.fileName).toBe("track.mp3");
    expect(discard).toHaveBeenCalledTimes(1);
  });
});
