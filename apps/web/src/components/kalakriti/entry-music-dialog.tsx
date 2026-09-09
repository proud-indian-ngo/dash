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
import { useState } from "react";
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
      byteSize: z.number().positive().max(MAX_KALAKRITI_MUSIC_SIZE_BYTES),
      fileName: z.string().min(1),
      mimeType: z.enum(ALLOWED_KALAKRITI_MUSIC_TYPES),
      objectKey: z.string().min(1),
    })
    .nullable(),
  removeExisting: z.boolean(),
});

// Mounted only while open, so every opening starts with a fresh staged form.
export function EntryMusicDialog({
  centerId,
  divisionId,
  editionId,
  entryId,
  musicFileName,
  onOpenChange,
}: {
  centerId: string;
  divisionId: string;
  editionId: string;
  entryId: string;
  musicFileName: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const zero = useZero();
  const deleteUpload = useServerFn(deleteTemporaryUpload);
  const [uploading, setUploading] = useState(false);
  const [closing, setClosing] = useState(false);
  const form = useForm({
    defaultValues: {
      music: null as EntryMusicClaim | null,
      removeExisting: false,
    },
    validators: { onChange: musicSchema, onSubmit: musicSchema },
    onSubmit: async ({ value }) => {
      if (uploading || closing) return;
      if (!(value.music || value.removeExisting)) {
        onOpenChange(false);
        return;
      }
      const mutationName = value.music
        ? "kalakritiEntry.attachOrReplaceMusic"
        : "kalakritiEntry.removeMusic";
      try {
        const args = { auditEntryId: uuidv7(), entryId, now: Date.now() };
        const result = await zero.mutate(
          value.music
            ? mutators.kalakritiEntry.attachOrReplaceMusic({
                ...args,
                ...value.music,
              })
            : mutators.kalakritiEntry.removeMusic(args)
        ).server;
        handleMutationResult(result, {
          entityId: entryId,
          mutation: mutationName,
          successMsg: "Music saved",
          errorMsg: "Failed to save music",
        });
        if (result.type !== "error") onOpenChange(false);
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
  const handleCancel = useEventCallback(async () => {
    if (uploading || closing || form.state.isSubmitting) return;
    setClosing(true);
    const music = form.state.values.music;
    try {
      if (music && isTemporaryR2Key(music.objectKey))
        await deleteUpload({ data: { key: music.objectKey } });
    } catch (error) {
      log.error({
        component: "EntryMusicDialog",
        action: "discardTemporaryMusic",
        entryId,
        editionId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Temporary uploads also expire through the bucket lifecycle policy.
    } finally {
      onOpenChange(false);
    }
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
            {musicFileName ? "Edit music" : "Upload music"}
          </DialogTitle>
          <DialogDescription>
            Attach or remove this Competition Entry's audio without changing its
            participants. Changes apply only when you save.
          </DialogDescription>
        </DialogHeader>
        <FormLayout form={form}>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(submitting) => (
              <fieldset
                className="grid gap-4"
                disabled={uploading || closing || submitting}
              >
                {musicFileName ? (
                  <CustomField<boolean>
                    label="Current music"
                    name="removeExisting"
                  >
                    {(field) => (
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 text-sm break-all">
                          {field.state.value
                            ? "Music will be removed on save"
                            : musicFileName}
                        </span>
                        <Button
                          aria-label={
                            field.state.value
                              ? "Keep current music"
                              : `Remove ${musicFileName}`
                          }
                          onClick={() => field.handleChange(!field.state.value)}
                          type="button"
                          variant="outline"
                        >
                          {field.state.value ? "Undo" : "Remove"}
                        </Button>
                      </div>
                    )}
                  </CustomField>
                ) : null}
                <CustomField<EntryMusicClaim | null>
                  description="Choose one MP3, M4A, or AAC file up to 20 MB."
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
                      onUploadingChange={setUploading}
                      onChange={field.handleChange}
                      value={field.state.value}
                    />
                  )}
                </CustomField>
                <FormActions
                  onCancel={handleCancel}
                  submitLabel="Save music"
                  submittingLabel="Saving..."
                  disabled={uploading || closing}
                />
              </fieldset>
            )}
          </form.Subscribe>
        </FormLayout>
      </DialogContent>
    </Dialog>
  );
}
