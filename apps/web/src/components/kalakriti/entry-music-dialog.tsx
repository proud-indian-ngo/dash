import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { isTemporaryR2Key } from "@pi-dash/shared/asset-ref";
import {
  ALLOWED_KALAKRITI_MUSIC_TYPES,
  MAX_KALAKRITI_MUSIC_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import {
  type EntryMusicClaim,
  EntryMusicUploadField,
} from "@/components/kalakriti/entry-music-field";
import { deleteTemporaryUpload } from "@/functions/attachments";
import { handleMutationResult } from "@/lib/mutation-result";

const musicSchema = z.object({
  music: z
    .object({
      id: z.string(),
      byteSize: z.number().positive().max(MAX_KALAKRITI_MUSIC_SIZE_BYTES),
      fileName: z.string().min(1),
      mimeType: z.enum(ALLOWED_KALAKRITI_MUSIC_TYPES),
      objectKey: z.string().min(1),
    })
    .array()
    .max(2),
  removeMusicFileIds: z.array(z.string()),
});

// Mounted only while open, so every opening starts with a fresh staged form.
export function EntryMusicDialog({
  centerId,
  divisionId,
  editionId,
  entryId,
  musicFiles,
  allowAdditions = true,
  onOpenChange,
}: {
  centerId: string;
  divisionId: string;
  editionId: string;
  entryId: string;
  musicFiles: readonly { id: string; fileName: string }[];
  allowAdditions?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const zero = useZero();
  const deleteUpload = useServerFn(deleteTemporaryUpload);
  const [uploading, setUploading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [failedUploads, setFailedUploads] = useState(false);
  const committed = useRef(false);
  const discardedKeys = useRef(new Set<string>());
  const form = useForm({
    defaultValues: {
      music: [] as EntryMusicClaim[],
      removeMusicFileIds: [] as string[],
    },
    validators: { onChange: musicSchema, onSubmit: musicSchema },
    onSubmit: async ({ value }) => {
      if (
        uploading ||
        closing ||
        failedUploads ||
        musicFiles.length -
          value.removeMusicFileIds.length +
          value.music.length >
          2
      )
        return;
      if (!(value.music.length || value.removeMusicFileIds.length)) {
        onOpenChange(false);
        return;
      }
      const mutationName = "kalakritiEntry.updateMusic";
      try {
        const args = { auditEntryId: uuidv7(), entryId, now: Date.now() };
        const result = await zero.mutate(
          mutators.kalakritiEntry.updateMusic({ ...args, ...value })
        ).server;
        handleMutationResult(result, {
          entityId: entryId,
          mutation: mutationName,
          successMsg: "Music saved",
          errorMsg: "Failed to save music",
        });
        if (result.type !== "error") {
          committed.current = true;
          onOpenChange(false);
        }
      } catch (error) {
        log.error({
          component: "EntryMusicDialog",
          action: "saveMusic",
          entryId,
          editionId,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error("Failed to save music");
      }
    },
  });
  const discardUploads = useEventCallback(async () => {
    if (committed.current) return;
    const music = form.state.values.music;
    try {
      await Promise.all(
        music.flatMap((file) => {
          if (
            !isTemporaryR2Key(file.objectKey) ||
            discardedKeys.current.has(file.objectKey)
          )
            return [];
          discardedKeys.current.add(file.objectKey);
          return [deleteUpload({ data: { key: file.objectKey } })];
        })
      );
    } catch (error) {
      log.error({
        component: "EntryMusicDialog",
        action: "discardTemporaryMusic",
        entryId,
        editionId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Temporary uploads also expire through the bucket lifecycle policy.
    }
  });
  useEffect(
    () => () => {
      discardUploads();
    },
    [discardUploads]
  );
  const handleCancel = useEventCallback(async () => {
    if (uploading || closing || form.state.isSubmitting) return;
    setClosing(true);
    await discardUploads();
    onOpenChange(false);
  });
  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) {
          handleCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {musicFiles.length ? "Edit music" : "Upload music"}
          </DialogTitle>
          <DialogDescription>
            Attach or remove this Competition Entry's audio without changing its
            participants. Changes apply only when you save.
          </DialogDescription>
        </DialogHeader>
        <FormLayout form={form}>
          <form.Subscribe
            selector={(state) => ({
              submitting: state.isSubmitting,
              additions: state.values.music.length,
            })}
          >
            {({ submitting, additions }) => (
              <fieldset
                className="grid gap-4"
                disabled={uploading || closing || submitting}
              >
                <CustomField<string[]>
                  label="Current music"
                  name="removeMusicFileIds"
                >
                  {(field) =>
                    musicFiles.map((file) => {
                      const removed = field.state.value.includes(file.id);
                      return (
                        <div key={file.id} className="flex items-center gap-2">
                          <span className="min-w-0 text-sm break-all">
                            {file.fileName}
                            {removed ? " · Removed on save" : ""}
                          </span>
                          <Button
                            disabled={
                              removed &&
                              musicFiles.length -
                                field.state.value.length +
                                additions >=
                                2
                            }
                            aria-label={
                              removed
                                ? `Keep ${file.fileName}`
                                : `Remove ${file.fileName}`
                            }
                            onClick={() =>
                              field.handleChange(
                                removed
                                  ? field.state.value.filter(
                                      (id) => id !== file.id
                                    )
                                  : [...field.state.value, file.id]
                              )
                            }
                            type="button"
                            variant="outline"
                          >
                            {removed ? "Undo" : "Remove"}
                          </Button>
                        </div>
                      );
                    })
                  }
                </CustomField>
                <form.Subscribe
                  selector={(state) => state.values.removeMusicFileIds.length}
                >
                  {(removedCount) =>
                    allowAdditions ? (
                      <CustomField<EntryMusicClaim[]>
                        description="Choose up to two MP3, M4A, or AAC files up to 20 MB each."
                        label="Music"
                        name="music"
                      >
                        {(field) => (
                          <EntryMusicUploadField
                            centerId={centerId}
                            divisionId={divisionId}
                            editionId={editionId}
                            entryId={entryId}
                            disabled={submitting || closing}
                            availableSlots={
                              2 - musicFiles.length + removedCount
                            }
                            onErrorsChange={setFailedUploads}
                            onUploadingChange={setUploading}
                            onChange={field.handleChange}
                            value={field.state.value}
                          />
                        )}
                      </CustomField>
                    ) : null
                  }
                </form.Subscribe>
                <FormActions
                  onCancel={handleCancel}
                  submitLabel="Save music"
                  submittingLabel="Saving..."
                  disabled={uploading || closing || failedUploads}
                />
              </fieldset>
            )}
          </form.Subscribe>
        </FormLayout>
      </DialogContent>
    </Dialog>
  );
}
