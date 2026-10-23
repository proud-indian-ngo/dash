import { EVENT_PHOTO_CAPTION_MAX_LENGTH } from "@pi-dash/shared/social-recap";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { TextareaField } from "@/components/form/textarea-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { handleMutationResult } from "@/lib/mutation-result";

const captionSchema = z.object({
  caption: z.string().trim().max(EVENT_PHOTO_CAPTION_MAX_LENGTH),
});

function CaptionForm({
  onOpenChange,
  photo,
}: {
  onOpenChange: (open: boolean) => void;
  photo: { caption: string | null; id: string };
}) {
  const zero = useZero();
  const form = useForm({
    defaultValues: { caption: photo.caption ?? "" },
    onSubmit: async ({ value }) => {
      const res = await zero.mutate(
        mutators.eventPhoto.setCaption({
          caption: value.caption,
          id: photo.id,
        })
      ).server;
      handleMutationResult(res, {
        entityId: photo.id,
        errorMsg: "Couldn't save the caption",
        mutation: "eventPhoto.setCaption",
        successMsg: "Caption saved",
      });
      if (res.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: { onChange: captionSchema, onSubmit: captionSchema },
  });
  return (
    <FormLayout form={form}>
      <TextareaField
        description="Leave empty to remove the caption."
        label="Caption"
        maxLength={EVENT_PHOTO_CAPTION_MAX_LENGTH}
        name="caption"
      />
      <FormActions
        onCancel={() => onOpenChange(false)}
        submitLabel="Save caption"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

export function PhotoCaptionDialog({
  onOpenChange,
  photo,
}: {
  onOpenChange: (open: boolean) => void;
  photo: { caption: string | null; id: string } | null;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={photo !== null}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit caption</DialogTitle>
          <DialogDescription>
            Shown with the photo and passed on for social posts.
          </DialogDescription>
        </DialogHeader>
        {photo ? (
          <CaptionForm
            key={photo.id}
            onOpenChange={onOpenChange}
            photo={photo}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
