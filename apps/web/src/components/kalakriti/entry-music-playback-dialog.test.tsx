import { describe, expect, it, mock } from "bun:test";

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const passthrough = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
);
mock.module("@pi-dash/design-system/components/ui/dialog", () => ({
  Dialog: passthrough,
  DialogContent: passthrough,
  DialogHeader: passthrough,
  DialogTitle: passthrough,
  DialogDescription: passthrough,
}));
const { EntryMusicPlaybackDialog } =
  await import("./entry-music-playback-dialog");

function render() {
  return renderToStaticMarkup(
    <EntryMusicPlaybackDialog
      entryId="entry-1"
      musicFileName="performance.mp3"
      onOpenChange={() => undefined}
    />
  );
}
describe("Entry music playback dialog", () => {
  it("uses native protected audio controls without starting playback automatically", () => {
    const html = render();
    expect(html).toContain("Play music");
    expect(html).toContain("performance.mp3");
    expect(html).toContain('<audio aria-label="Play performance.mp3"');
    expect(html).toContain('controls=""');
    expect(html).toContain('preload="metadata"');
    expect(html).toContain(
      'src="/api/attachments/download?id=entry-1&amp;kind=kalakritiEntryMusic&amp;disposition=inline"'
    );
    expect(html.toLowerCase()).not.toContain("autoplay");
  });
  it("provides a distinct explicit Download using attachment disposition in the same tab", () => {
    const html = render();
    expect(html).toContain(
      'href="/api/attachments/download?id=entry-1&amp;kind=kalakritiEntryMusic"'
    );
    expect(html).toContain(">Download</a>");
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain("Edit music");
  });
});
