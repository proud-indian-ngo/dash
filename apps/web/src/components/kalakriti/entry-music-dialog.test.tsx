import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

interface Claim {
  id: string;
  objectKey: string;
  fileName: string;
  mimeType: "audio/mpeg";
  byteSize: number;
}
interface Values {
  music: Claim[];
  removeMusicFileIds: string[];
}
let submit: (args: { value: Values }) => Promise<void>;
let cancel: () => Promise<void>;
let state = {
  isSubmitting: false,
  values: { music: [], removeMusicFileIds: [] } as Values,
};
const mutate = mock(() => ({ server: Promise.resolve({ type: "success" }) }));
const deleteUpload = mock(() => Promise.resolve());
const close = mock(() => undefined);
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
mock.module("@rocicorp/zero/react", () => ({ useZero: () => ({ mutate }) }));
mock.module("@tanstack/react-start", () => ({
  useServerFn: () => deleteUpload,
}));
mock.module("@/functions/attachments", () => ({
  deleteTemporaryUpload: () => undefined,
}));
mock.module("@pi-dash/zero/mutators", () => ({
  mutators: {
    kalakritiEntry: {
      updateMusic: (args: unknown) => ({ name: "updateMusic", args }),
    },
  },
}));
mock.module("@tanstack/react-form", () => ({
  useForm: (options: { onSubmit: typeof submit }) => {
    submit = options.onSubmit;
    return {
      state,
      Subscribe: ({
        selector,
        children,
      }: {
        selector: (value: typeof state) => unknown;
        children: (value: unknown) => ReactNode;
      }) => children(selector(state)),
    };
  },
}));
mock.module("@/components/form/form-layout", () => ({
  FormLayout: passthrough,
}));
mock.module("@/components/form/custom-field", () => ({
  CustomField: () => null,
}));
mock.module("@/components/form/form-actions", () => ({
  FormActions: ({ onCancel }: { onCancel: typeof cancel }) => {
    cancel = onCancel;
    return <button type="submit">Save music</button>;
  },
}));
mock.module("@/components/kalakriti/entry-music-field", () => ({
  EntryMusicUploadField: () => null,
}));
mock.module("@/lib/mutation-result", () => ({
  handleMutationResult: () => undefined,
}));
const { EntryMusicDialog } = await import("./entry-music-dialog");
const claim: Claim = {
  id: "new-file",
  objectKey: "attachments/kalakriti-music/tmp/user/new.mp3",
  fileName: "new.mp3",
  mimeType: "audio/mpeg",
  byteSize: 20,
};
const second: Claim = {
  ...claim,
  id: "second",
  objectKey: "attachments/kalakriti-music/tmp/user/second.mp3",
};
function render() {
  return renderToStaticMarkup(
    <EntryMusicDialog
      centerId="center"
      divisionId="division"
      editionId="edition"
      entryId="entry"
      musicFiles={[{ id: "current", fileName: "current.mp3" }]}
      onOpenChange={close}
    />
  );
}
beforeEach(() => {
  mutate.mockClear();
  deleteUpload.mockClear();
  close.mockClear();
  state = {
    isSubmitting: false,
    values: { music: [], removeMusicFileIds: [] },
  };
});
describe("existing Entry music form", () => {
  it("opens without changing persisted attachments", () => {
    expect(render()).toContain("Edit music");
    expect(mutate).not.toHaveBeenCalled();
  });
  it("saves additions and removals atomically", async () => {
    render();
    await submit({
      value: { music: [claim, second], removeMusicFileIds: ["current"] },
    });
    expect(mutate).toHaveBeenCalledWith({
      name: "updateMusic",
      args: expect.objectContaining({
        entryId: "entry",
        music: [claim, second],
        removeMusicFileIds: ["current"],
      }),
    });
    expect(close).toHaveBeenCalledWith(false);
    expect(deleteUpload).not.toHaveBeenCalled();
  });
  it("stages removal until Save", async () => {
    render();
    expect(mutate).not.toHaveBeenCalled();
    await submit({ value: { music: [], removeMusicFileIds: ["current"] } });
    expect(mutate).toHaveBeenCalledWith({
      name: "updateMusic",
      args: expect.objectContaining({
        entryId: "entry",
        music: [],
        removeMusicFileIds: ["current"],
      }),
    });
  });
  it("Cancel cleans both temporary successes, never persisted files", async () => {
    state.values = { music: [claim, second], removeMusicFileIds: ["current"] };
    render();
    await cancel();
    expect(deleteUpload).toHaveBeenCalledTimes(2);
    expect(deleteUpload).toHaveBeenCalledWith({
      data: { key: claim.objectKey },
    });
    expect(deleteUpload).toHaveBeenCalledWith({
      data: { key: second.objectKey },
    });
    expect(mutate).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(false);
  });
  it("preserves claims after failed Save for retry", async () => {
    mutate.mockImplementationOnce(() => ({
      server: Promise.resolve({ type: "error" }),
    }));
    state.values = { music: [claim], removeMusicFileIds: [] };
    render();
    await submit({ value: state.values });
    expect(close).not.toHaveBeenCalled();
    expect(deleteUpload).not.toHaveBeenCalled();
    await submit({ value: state.values });
    expect(close).toHaveBeenCalledWith(false);
    expect(mutate).toHaveBeenCalledTimes(2);
  });
  it("Cancel preserves staged persisted removals", async () => {
    state.values.removeMusicFileIds = ["current"];
    render();
    await cancel();
    expect(mutate).not.toHaveBeenCalled();
    expect(deleteUpload).not.toHaveBeenCalled();
  });
  it("does not close during a pending save", async () => {
    state.isSubmitting = true;
    render();
    await cancel();
    expect(close).not.toHaveBeenCalled();
    expect(deleteUpload).not.toHaveBeenCalled();
  });
  it("refuses a staged total above two", async () => {
    render();
    await submit({ value: { music: [claim, second], removeMusicFileIds: [] } });
    expect(mutate).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
