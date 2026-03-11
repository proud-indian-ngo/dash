import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { WhatsappGroup } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { CheckboxField } from "@/components/form/checkbox-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";

function epochToDatetimeLocal(epoch: number): string {
  return format(new Date(epoch), "yyyy-MM-dd'T'HH:mm");
}

function datetimeLocalToEpoch(value: string): number {
  return new Date(value).getTime();
}

const eventFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  location: z.string().optional(),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().optional(),
  isPublic: z.boolean(),
  frequency: z.enum(["", "weekly", "biweekly", "monthly"]),
  recurrenceEndDate: z.string().optional(),
  copyAllMembers: z.boolean(),
  whatsappGroupId: z.string().optional(),
  createWaGroup: z.boolean(),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

interface InitialValues {
  description: string | null;
  endTime: number | null;
  id: string;
  isPublic: boolean;
  location: string | null;
  name: string;
  parentEventId: string | null;
  recurrenceRule: {
    frequency: "weekly" | "biweekly" | "monthly";
    endDate?: string;
  } | null;
  startTime: number;
  whatsappGroupId: string | null;
}

interface EventFormDialogProps {
  initialValues?: InitialValues;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  teamId: string;
}

function getDefaultValues(initialValues?: InitialValues): EventFormValues {
  return {
    name: initialValues?.name ?? "",
    description: initialValues?.description ?? "",
    location: initialValues?.location ?? "",
    startTime: initialValues
      ? epochToDatetimeLocal(initialValues.startTime)
      : "",
    endTime: initialValues?.endTime
      ? epochToDatetimeLocal(initialValues.endTime)
      : "",
    isPublic: initialValues?.isPublic ?? false,
    frequency: initialValues?.recurrenceRule?.frequency ?? "",
    recurrenceEndDate: initialValues?.recurrenceRule?.endDate ?? "",
    copyAllMembers: false,
    whatsappGroupId: initialValues?.whatsappGroupId ?? "",
    createWaGroup: false,
  };
}

function buildUpdateMutatorArgs(id: string, value: EventFormValues) {
  return {
    id,
    name: value.name.trim(),
    description: value.description?.trim() || undefined,
    location: value.location?.trim() || undefined,
    startTime: datetimeLocalToEpoch(value.startTime),
    endTime: value.endTime ? datetimeLocalToEpoch(value.endTime) : undefined,
    isPublic: value.isPublic,
    whatsappGroupId: value.whatsappGroupId || undefined,
  };
}

function buildCreateMutatorArgs(teamId: string, value: EventFormValues) {
  const recurrenceRule = value.frequency
    ? {
        frequency: value.frequency as "weekly" | "biweekly" | "monthly",
        ...(value.recurrenceEndDate
          ? { endDate: value.recurrenceEndDate }
          : {}),
      }
    : undefined;

  return {
    id: crypto.randomUUID(),
    teamId,
    name: value.name.trim(),
    description: value.description?.trim() || undefined,
    location: value.location?.trim() || undefined,
    startTime: datetimeLocalToEpoch(value.startTime),
    endTime: value.endTime ? datetimeLocalToEpoch(value.endTime) : undefined,
    isPublic: value.isPublic,
    whatsappGroupId: value.whatsappGroupId || undefined,
    createWhatsAppGroup: value.createWaGroup || undefined,
    copyAllMembers: value.copyAllMembers || undefined,
    recurrenceRule,
  };
}

function EventFormContent({
  initialValues,
  isEdit,
  onOpenChange,
  teamId,
  waGroupOptions,
}: {
  initialValues?: InitialValues;
  isEdit: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  waGroupOptions: { label: string; value: string }[];
}) {
  const zero = useZero();

  const form = useForm({
    defaultValues: getDefaultValues(initialValues),
    onSubmit: ({ value }) => {
      if (
        value.endTime &&
        datetimeLocalToEpoch(value.endTime) <=
          datetimeLocalToEpoch(value.startTime)
      ) {
        toast.error("End time must be after start time");
        return;
      }

      const mutation =
        isEdit && initialValues
          ? zero.mutate(
              mutators.teamEvent.update(
                buildUpdateMutatorArgs(initialValues.id, value)
              )
            )
          : zero.mutate(
              mutators.teamEvent.create(buildCreateMutatorArgs(teamId, value))
            );
      mutation.server.then((res) => {
        if (res.type === "error") {
          toast.error(
            isEdit ? "Failed to update event" : "Failed to create event"
          );
        } else {
          if (isEdit) {
            toast.success("Event updated");
          } else {
            toast.success(
              value.createWaGroup
                ? "Event created. WhatsApp group will be created shortly."
                : "Event created"
            );
          }
          onOpenChange(false);
        }
      });
    },
    validators: {
      onBlur: eventFormSchema,
      onSubmit: eventFormSchema,
    },
  });

  return (
    <FormLayout form={form}>
      <InputField
        isRequired
        label="Name"
        name="name"
        placeholder="Event name"
      />
      <TextareaField
        label="Description"
        name="description"
        placeholder="Optional description"
        rows={3}
      />
      <InputField
        description="Google Maps, Google Calendar, or Google Meet link"
        label="Location"
        name="location"
        placeholder="https://meet.google.com/..."
      />
      <InputField
        isRequired
        label="Start Time"
        name="startTime"
        type="datetime-local"
      />
      <InputField label="End Time" name="endTime" type="datetime-local" />
      <CheckboxField label="Public" name="isPublic" />
      {!isEdit && (
        <>
          <SelectField
            label="Recurrence"
            name="frequency"
            options={[
              { label: "None", value: "" },
              { label: "Weekly", value: "weekly" },
              { label: "Biweekly", value: "biweekly" },
              { label: "Monthly", value: "monthly" },
            ]}
            placeholder="None"
          />
          <form.Subscribe selector={(state) => state.values.frequency}>
            {(frequency) =>
              frequency ? (
                <>
                  <InputField
                    label="Recurrence End Date"
                    name="recurrenceEndDate"
                    type="date"
                  />
                  <CheckboxField
                    label="Copy all members to recurring events"
                    name="copyAllMembers"
                  />
                </>
              ) : null
            }
          </form.Subscribe>
        </>
      )}
      <SelectField
        label="WhatsApp Group"
        name="whatsappGroupId"
        options={waGroupOptions}
        placeholder="None"
      />
      <form.Subscribe
        selector={(state) => ({
          whatsappGroupId: state.values.whatsappGroupId,
        })}
      >
        {({ whatsappGroupId }) =>
          isEdit || whatsappGroupId ? null : (
            <CheckboxField label="Create WhatsApp group" name="createWaGroup" />
          )
        }
      </form.Subscribe>
      <FormActions
        onCancel={() => onOpenChange(false)}
        submitLabel={isEdit ? "Save" : "Create"}
        submittingLabel={isEdit ? "Saving..." : "Creating..."}
      />
    </FormLayout>
  );
}

export function EventFormDialog({
  teamId,
  initialValues,
  onOpenChange,
  open,
}: EventFormDialogProps) {
  const isEdit = !!initialValues;
  // Increment key each time dialog opens to remount form with fresh state
  const [formKey, setFormKey] = useState(0);

  const [whatsappGroups] = useQuery(queries.whatsappGroup.all());
  const waGroupOptions = useMemo(
    () => [
      { label: "None", value: "" },
      ...(whatsappGroups ?? []).map((g: WhatsappGroup) => ({
        label: g.name,
        value: g.id,
      })),
    ],
    [whatsappGroups]
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Event" : "Create Event"}</DialogTitle>
        </DialogHeader>
        <EventFormContent
          initialValues={initialValues}
          isEdit={isEdit}
          key={formKey}
          onOpenChange={onOpenChange}
          teamId={teamId}
          waGroupOptions={waGroupOptions}
        />
      </DialogContent>
    </Dialog>
  );
}
