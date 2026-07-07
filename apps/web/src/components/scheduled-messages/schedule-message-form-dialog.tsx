import {
  Field,
  FieldError,
  FieldLabel,
} from "@pi-dash/design-system/components/ui/field";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Switch } from "@pi-dash/design-system/components/ui/switch";
import type {
  ScheduledMessage,
  ScheduledMessageRecipient,
} from "@pi-dash/zero/schema";
import { useForm } from "@tanstack/react-form";
import { addHours, startOfHour } from "date-fns";
import { useMemo, useState } from "react";
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

const scheduledFormSchema = z.object({
  attachments: z.array(attachmentSchema).max(5),
  message: z.string().min(1, "Message is required"),
  recipients: z
    .array(recipientSchema)
    .min(1, "At least one recipient is required")
    .max(10),
  scheduledAt: z.date().refine((val: any) => val.getTime() > Date.now(), {
    message: "Must be in the future",
  }),
});

const sendNowFormSchema = z.object({
  attachments: z.array(attachmentSchema).max(5),
  message: z.string().min(1, "Message is required"),
  recipients: z
    .array(recipientSchema)
    .min(1, "At least one recipient is required")
    .max(10),
  scheduledAt: z.date(),
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
    sendNow?: boolean;
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
  const [sendNow, setSendNow] = useState(false);
  const entityId = useMemo(
    () => initialValues?.id ?? "scheduled-message-draft",
    [initialValues?.id]
  );

  const formSchema = sendNow ? sendNowFormSchema : scheduledFormSchema;

  const form = useForm({
    defaultValues: {
      attachments: (initialValues?.attachments ?? []) as MediaAttachment[],
      message: initialValues?.message ?? "",
      recipients: (initialValues?.recipients ?? []).map((r: any) => ({
        id: r.recipientId,
        label: r.label,
        type: r.type as "group" | "user",
      })),
      scheduledAt: initialValues
        ? new Date(initialValues.scheduledAt)
        : addHours(startOfHour(new Date()), 1),
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        attachments:
          value.attachments.length > 0 ? value.attachments : undefined,
        message: value.message,
        recipients: value.recipients,
        scheduledAt: sendNow ? Date.now() : value.scheduledAt.getTime(),
        sendNow: sendNow || undefined,
      });
    },
    validators: {
      onChange: formSchema,
      onSubmit: formSchema,
    },
  });
  const stableOnOpenChange0 = (v: any) => {
    if (!v) {
      setFormKey((k: any) => k + 1);
      setSendNow(false);
      onClose();
    }
  };

  return (
    <FormModal
      description={
        isEdit
          ? "Edit the scheduled message"
          : `${sendNow ? "Send" : "Schedule"} a WhatsApp message`
      }
      onOpenChange={stableOnOpenChange0}
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

        {Boolean(!isEdit) && (
          <div className="flex items-center gap-2">
            <Switch
              checked={sendNow}
              id="send-now"
              onCheckedChange={setSendNow}
            />
            <Label htmlFor="send-now">Send now</Label>
          </div>
        )}

        {Boolean(!sendNow) && (
          <DateTimeField
            isRequired
            label="Scheduled at"
            minDate={new Date()}
            name="scheduledAt"
            placeholder="Pick date and time"
          />
        )}

        <form.Field name="recipients">
          {(field: any) => {
            const submitted = form.state.submissionAttempts > 0;
            const hasError =
              (field.state.meta.isBlurred || submitted) &&
              field.state.meta.errors.length > 0;
            return (
              <Field data-invalid={hasError || undefined}>
                <FieldLabel htmlFor="recipients">
                  Recipients{" "}
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </FieldLabel>
                <RecipientPicker
                  onChange={(val: any) => field.handleChange(val)}
                  value={field.state.value}
                />
                {Boolean(hasError) && (
                  <FieldError errors={field.state.meta.errors} />
                )}
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="attachments">
          {(field: any) => (
            <MediaUpload
              entityId={entityId}
              onChange={(val: any) => field.handleChange(val)}
              value={field.state.value}
            />
          )}
        </form.Field>

        <FormActions
          onCancel={onClose}
          submitLabel={
            isEdit ? "Save changes" : `${sendNow ? "Send" : "Schedule"} message`
          }
          submittingLabel={
            isEdit ? "Saving..." : `${sendNow ? "Sending" : "Scheduling"}...`
          }
        />
      </FormLayout>
    </FormModal>
  );
}
