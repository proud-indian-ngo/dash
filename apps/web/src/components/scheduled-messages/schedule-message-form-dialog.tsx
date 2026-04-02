import { Label } from "@pi-dash/design-system/components/ui/label";
import type { ScheduledMessage } from "@pi-dash/zero/schema";
import { useForm } from "@tanstack/react-form";
import { format } from "date-fns";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { FormModal } from "@/components/form/form-modal";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";
import {
  type MediaAttachment,
  MediaUpload,
} from "@/components/scheduled-messages/media-upload";
import {
  type Recipient,
  RecipientPicker,
} from "@/components/scheduled-messages/recipient-picker";

const recipientSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["group", "user"]),
});

const attachmentSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  r2Key: z.string(),
});

const formSchema = z.object({
  message: z.string().min(1, "Message is required"),
  scheduledAt: z
    .string()
    .min(1, "Scheduled time is required")
    .refine((val) => new Date(val).getTime() > Date.now(), {
      message: "Must be in the future",
    }),
  recipients: z
    .array(recipientSchema)
    .min(1, "At least one recipient is required")
    .max(10),
  attachments: z.array(attachmentSchema).max(5),
});

type FormValues = z.infer<typeof formSchema>;

function toDatetimeLocal(ts: number): string {
  return format(new Date(ts), "yyyy-MM-dd'T'HH:mm");
}

function defaultScheduledAt(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

interface ScheduleMessageFormDialogProps {
  initialValues?: ScheduledMessage;
  onClose: () => void;
  onSubmit: (values: {
    message: string;
    scheduledAt: number;
    recipients: Recipient[];
    attachments?: MediaAttachment[];
  }) => Promise<void>;
  open: boolean;
}

export function ScheduleMessageFormDialog({
  initialValues,
  onClose,
  onSubmit,
  open,
}: ScheduleMessageFormDialogProps) {
  const isEdit = !!initialValues;
  const [entityId] = useState(() => initialValues?.id ?? uuidv7());

  const form = useForm({
    defaultValues: {
      message: initialValues?.message ?? "",
      scheduledAt: initialValues
        ? toDatetimeLocal(initialValues.scheduledAt)
        : defaultScheduledAt(),
      recipients: (initialValues?.recipients ?? []) as Recipient[],
      attachments: (initialValues?.attachments ?? []) as MediaAttachment[],
    } satisfies FormValues,
    onSubmit: async ({ value }) => {
      await onSubmit({
        message: value.message,
        scheduledAt: new Date(value.scheduledAt).getTime(),
        recipients: value.recipients,
        attachments:
          value.attachments.length > 0 ? value.attachments : undefined,
      });
    },
    validators: {
      onChange: formSchema,
      onSubmit: formSchema,
    },
  });

  return (
    <FormModal
      description={
        isEdit ? "Edit the scheduled message" : "Schedule a WhatsApp message"
      }
      onOpenChange={(v) => {
        if (!v) {
          onClose();
        }
      }}
      open={open}
      title={isEdit ? "Edit scheduled message" : "Schedule message"}
    >
      <FormLayout form={form} key={initialValues?.id ?? "create"}>
        <TextareaField
          isRequired
          label="Message"
          name="message"
          placeholder="Enter the message content..."
          rows={4}
        />

        <InputField
          isRequired
          label="Scheduled at"
          name="scheduledAt"
          type="datetime-local"
        />

        <div className="flex flex-col gap-1.5">
          <Label className="font-medium text-sm">
            Recipients <span className="text-destructive">*</span>
          </Label>
          <form.Field name="recipients">
            {(field) => (
              <RecipientPicker
                onChange={(val) => field.handleChange(val)}
                value={field.state.value}
              />
            )}
          </form.Field>
        </div>

        <form.Field name="attachments">
          {(field) => (
            <MediaUpload
              entityId={entityId}
              onChange={(val) => field.handleChange(val)}
              value={field.state.value}
            />
          )}
        </form.Field>

        <FormActions
          onCancel={onClose}
          submitLabel={isEdit ? "Save changes" : "Schedule message"}
          submittingLabel={isEdit ? "Saving..." : "Scheduling..."}
        />
      </FormLayout>
    </FormModal>
  );
}
