import { describe, expect, it } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { EntryMusicCell } from "./entry-music-cell";

function render(musicFileName: string | null, canWrite = false) {
  return renderToStaticMarkup(
    <EntryMusicCell
      canWrite={canWrite}
      musicFiles={
        musicFileName
          ? [
              { id: "file", fileName: musicFileName },
              { id: "second", fileName: "second.m4a" },
            ]
          : []
      }
      onEdit={() => undefined}
      onPlay={() => undefined}
    />
  );
}

describe("Entry music playback action", () => {
  it("offers a filename button independently of editing permission", () => {
    const html = render("performance.mp3");
    expect(html).toContain("<button");
    expect(html).toContain("performance.mp3");
    expect(html).toContain("second.m4a");
    expect(html).toContain("2 files");
    expect(html).not.toContain("<audio");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("target=");
    expect(html).not.toContain("Edit music");
  });
  it("retains the edit action alongside the filename button", () => {
    const html = render("performance.mp3", true);
    expect(html).toContain("performance.mp3");
    expect(html).toContain("Edit music");
  });
  it("offers no playback action without a saved file", () => {
    expect(render(null)).not.toContain("<button");
    expect(render(null, true)).toContain("Upload music");
  });
});
