import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

interface Values {
  music: {
    objectKey: string;
    fileName: string;
    mimeType: "audio/mpeg";
    byteSize: number;
  } | null;
  removeExisting: boolean;
}
let submit: (args: { value: Values }) => Promise<void>;
let cancel: () => Promise<void>;
let state = {
  isSubmitting: false,
  values: { music: null, removeExisting: false } as Values,
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
      attachOrReplaceMusic: (args: unknown) => ({ name: "attach", args }),
      removeMusic: (args: unknown) => ({ name: "remove", args }),
    },
  },
}));
mock.module("@tanstack/react-form", () => ({
  useForm: (options: { onSubmit: typeof submit }) => {
    submit = options.onSubmit;
    return {
      state,
      Subscribe: ({ children }: { children: (busy: boolean) => ReactNode }) =>
        children(state.isSubmitting),
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
const claim = {
  objectKey: "attachments/kalakriti-music/tmp/user/new.mp3",
  fileName: "new.mp3",
  mimeType: "audio/mpeg" as const,
  byteSize: 20,
};
function render() {
  return renderToStaticMarkup(
    <EntryMusicDialog
      centerId="center"
      divisionId="division"
      editionId="edition"
      entryId="entry"
      musicFileName="current.mp3"
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
    values: { music: null, removeExisting: false },
  };
});

describe("existing Entry music form", () => {
  it("opens a dedicated form without changing the persisted attachment", () => {
    expect(render()).toContain("Edit music");
    expect(mutate).not.toHaveBeenCalled();
  });
  it("saves replacement only through the music mutation", async () => {
    render();
    await submit({ value: { music: claim, removeExisting: false } });
    expect(mutate).toHaveBeenCalledWith({
      name: "attach",
      args: expect.objectContaining({ entryId: "entry", ...claim }),
    });
    expect(close).toHaveBeenCalledWith(false);
    expect(deleteUpload).not.toHaveBeenCalled();
  });
  it("stages removal until Save", async () => {
    render();
    expect(mutate).not.toHaveBeenCalled();
    await submit({ value: { music: null, removeExisting: true } });
    expect(mutate).toHaveBeenCalledWith({
      name: "remove",
      args: expect.objectContaining({ entryId: "entry" }),
    });
  });
  it("Cancel discards only temporary uploads and never removes persisted music", async () => {
    state.values = { music: claim, removeExisting: true };
    render();
    await cancel();
    expect(deleteUpload).toHaveBeenCalledWith({
      data: { key: claim.objectKey },
    });
    expect(mutate).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(false);
  });
  it("keeps a failed save open so the same uploaded claim can be retried", async () => {
    mutate.mockImplementationOnce(() => ({
      server: Promise.resolve({ type: "error" }),
    }));
    state.values = { music: claim, removeExisting: false };
    render();
    await submit({ value: state.values });
    expect(close).not.toHaveBeenCalled();
    expect(deleteUpload).not.toHaveBeenCalled();
    await submit({ value: state.values });
    expect(close).toHaveBeenCalledWith(false);
    expect(mutate).toHaveBeenCalledTimes(2);
  });
  it("cancels a staged removal without touching the current file", async () => {
    state.values.removeExisting = true;
    render();
    await cancel();
    expect(mutate).not.toHaveBeenCalled();
    expect(deleteUpload).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(false);
  });
  it("does not close during a pending save", async () => {
    state.isSubmitting = true;
    render();
    await cancel();
    expect(close).not.toHaveBeenCalled();
    expect(deleteUpload).not.toHaveBeenCalled();
  });
});
