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

const scheduledFormSchema = z.object({
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

const sendNowFormSchema = z.object({
  message: z.string().min(1, "Message is required"),
  scheduledAt: z.date(),
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
    () => initialValues?.id ?? uuidv7(),
    [initialValues?.id]
  );

  const formSchema = sendNow ? sendNowFormSchema : scheduledFormSchema;

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
        scheduledAt: sendNow ? Date.now() : value.scheduledAt.getTime(),
        recipients: value.recipients,
        attachments:
          value.attachments.length > 0 ? value.attachments : undefined,
        sendNow: sendNow || undefined,
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
        isEdit
          ? "Edit the scheduled message"
          : `${sendNow ? "Send" : "Schedule"} a WhatsApp message`
      }
      onOpenChange={(v) => {
        if (!v) {
          setFormKey((k) => k + 1);
          setSendNow(false);
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

        {!isEdit && (
          <div className="flex items-center gap-2">
            <Switch
              checked={sendNow}
              id="send-now"
              onCheckedChange={setSendNow}
            />
            <Label htmlFor="send-now">Send now</Label>
          </div>
        )}

        {!sendNow && (
          <DateTimeField
            isRequired
            label="Scheduled at"
            minDate={new Date()}
            name="scheduledAt"
            placeholder="Pick date and time"
          />
        )}

        <form.Field name="recipients">
          {(field) => {
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
                  onChange={(val) => field.handleChange(val)}
                  value={field.state.value}
                />
                {hasError && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        </form.Field>

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
