import { expect, it, mock } from "bun:test";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const effects: (() => void | (() => void))[] = [];
mock.module("react", () => ({
  ...React,
  useEffect: (setup: () => void | (() => void)) => {
    effects.push(setup);
  },
}));
mock.module("@pi-dash/design-system/hooks/use-event-callback", () => ({
  useEventCallback: (fn: unknown) => fn,
}));
mock.module("@pi-dash/design-system/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));
mock.module("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
mock.module("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));
mock.module("@/functions/attachments", () => ({
  deleteTemporaryUpload: () => undefined,
  getKalakritiEntryMusicUploadUrl: () => undefined,
}));
const { EntryMusicUploadField } = await import("./entry-music-field");

it("clears the parent failure and pending gates when a selection change unmounts the upload field", () => {
  let failed = true;
  let uploading = true;
  renderToStaticMarkup(
    <EntryMusicUploadField
      centerId="center"
      divisionId="division"
      editionId="edition"
      onErrorsChange={(value) => {
        failed = value;
      }}
      onUploadingChange={(value) => {
        uploading = value;
      }}
      onChange={() => undefined}
      value={[]}
    />
  );
  const cleanups = effects.map((setup) => setup());
  expect(failed).toBe(true);
  for (const cleanup of cleanups) cleanup?.();
  expect(failed).toBe(false);
  expect(uploading).toBe(false);
});
