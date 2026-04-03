import { Label } from "@pi-dash/design-system/components/ui/label";
import type {
  ScheduledMessage,
  ScheduledMessageRecipient,
} from "@pi-dash/zero/schema";
import { useForm } from "@tanstack/react-form";
import { addHours, startOfHour } from "date-fns";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { DateTimeField } from "@/components/form/date-time-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { FormModal } from "@/components/form/form-modal";
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
  scheduledAt: z.date().refine((val) => val.getTime() > Date.now(), {
    message: "Must be in the future",
  }),
  recipients: z
    .array(recipientSchema)
    .min(1, "At least one recipient is required")
    .max(10),
  attachments: z.array(attachmentSchema).max(5),
});

type ScheduledMessageWithRecipients = ScheduledMessage & {
  recipients: ScheduledMessageRecipient[];
};

interface ScheduleMessageFormDialogProps {
  initialValues?: ScheduledMessageWithRecipients;
  onClose: () => void;
  onSubmit: (values: {
    attachments?: MediaAttachment[];
    message: string;
    recipients: Recipient[];
    scheduledAt: number;
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
  const [formKey, setFormKey] = useState(0);
  const [entityId] = useState(() => initialValues?.id ?? uuidv7());

  const form = useForm({
    defaultValues: {
      message: initialValues?.message ?? "",
      scheduledAt: initialValues
        ? new Date(initialValues.scheduledAt)
        : addHours(startOfHour(new Date()), 1),
      recipients: (initialValues?.recipients ?? []).map((r) => ({
        id: r.recipientId,
        label: r.label,
        type: r.type as "group" | "user",
      })),
      attachments: (initialValues?.attachments ?? []) as MediaAttachment[],
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        message: value.message,
        scheduledAt: value.scheduledAt.getTime(),
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
        if (v) {
          setFormKey((k) => k + 1);
        } else {
          onClose();
        }
      }}
      open={open}
      title={isEdit ? "Edit scheduled message" : "Schedule message"}
    >
      <FormLayout form={form} key={formKey}>
        <TextareaField
          isRequired
          label="Message"
          name="message"
          placeholder="Enter the message content..."
          rows={4}
        />

        <DateTimeField
          isRequired
          label="Scheduled at"
          minDate={new Date()}
          name="scheduledAt"
          placeholder="Pick date and time"
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
